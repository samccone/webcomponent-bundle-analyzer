#!/usr/bin/env node

"use strict";

if (process.argv[2] === undefined || process.argv[3] === undefined) {
  throw new Error('Missing required root dir and root element dir arguments.');
}

var baseUrl = process.argv[2]
var rootElm = process.argv[3]
var fs = require('fs');
var path = require('path');
var buildPage = require('./build-page');
var Analyzer = require('polymer-analyzer/lib/analyzer');
var FSUrlLoader= require('polymer-analyzer/lib/url-loader/fs-url-loader');
var PackageUrlResolver = require('polymer-analyzer/lib/url-loader/package-url-resolver');

var analyzer = new Analyzer.Analyzer({
  urlLoader: new FSUrlLoader.FSUrlLoader(baseUrl),
  urlResolver: new PackageUrlResolver.PackageUrlResolver()
});

function findExisting(url, urls) {
  if (urls[url] !== undefined) {
    return urls[url];
  }
  for (var node of Object.keys(urls)) {
    var ret = findExisting(url, urls[node]);
    if (ret !== undefined) {
      return ret;
    }
  }
}

function isFileInCache(filePath, fileSizeCache) {
  return fileSizeCache[filePath] !== undefined;
}

function getFileSize(filePath, fileSizeCache) {
  if (!isFileInCache(filePath, fileSizeCache)) {
    fileSizeCache[filePath] = fs.lstatSync(fs.realpathSync(
        path.join(baseUrl, filePath)))['size'];

    return fileSizeCache[filePath];
  }

  // If the file is already in the cache assume has no size due to http cache.
  return 0;
}

function generateTableData(nodeUrls, fileSizeCache, parent) {
  for (let url of Object.keys(nodeUrls)) {
    // Do not add to dep graph if already present.. due to http cache.
    if (!isFileInCache(url, fileSizeCache)) {
      let toPush =  {
        label: url,
        fileSize: getFileSize(url, fileSizeCache),
        groups: []
      };
      parent.push(toPush);

      if (Object.keys(nodeUrls[url]).length !== 0) {
        generateTableData(nodeUrls[url], fileSizeCache, toPush.groups);
      }
    }
  }
}

function getTotalGroupWeight(node) {
  let totalWeight = node.fileSize;

  for (let _node of node.groups) {
    totalWeight += getTotalGroupWeight(_node);
  }

  return totalWeight;
}

function generateGroupWeights(node) {
  node.weight = getTotalGroupWeight(node);

  for (let _node of node.groups) {
    generateGroupWeights(_node);
  }
}

analyzer.analyze(rootElm)
  .then(function (document) {
    var imports = document.getByKind('import');
    var nodeUrls = {};
    var fileSizeCache = {};
    var groups = [];
    var polymerImported = false;

    for (let _import of imports) {
      var importParent = findExisting(_import.sourceRange.file, nodeUrls);
      if (importParent === undefined) {
        nodeUrls[_import.sourceRange.file] = {};
        nodeUrls[_import.sourceRange.file][_import.url] = {};
      }
      else {
        importParent[_import.url] = {};
      }
    }

    generateTableData(nodeUrls, fileSizeCache, groups);
    generateGroupWeights(groups[0]);

    console.log(buildPage(fs.readFileSync(path.join(
        __dirname, 'vendor/carrotsearch.foamtree.js'), 'utf-8'),
          groups));

  }).catch(function(e) { return console.log(e); });
