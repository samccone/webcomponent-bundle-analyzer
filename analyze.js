#!/usr/bin/env node

"use strict";

if (process.argv[2] === undefined || process.argv[3] === undefined) {
  throw new Error('Missing required root dir and root element dir arguments.');
}

var baseUrl = process.argv[2]
var rootElm = process.argv[3]
var fs = require('fs');
var path = require('path');
var Analyzer = require('./node_modules/polymer-analyzer/lib/analyzer');
var FSUrlLoader= require('./node_modules/polymer-analyzer/lib/url-loader/fs-url-loader');
var PackageUrlResolver = require('./node_modules/polymer-analyzer/lib/url-loader/package-url-resolver');

var analyzer = new Analyzer.Analyzer({
  urlLoader: new FSUrlLoader.FSUrlLoader(baseUrl),
  urlResolver: new PackageUrlResolver.PackageUrlResolver()
});

function buildPage(vendor, groups) {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <style> *{ margin: 0; padding: 0}
          #group-info {
            height: 100px;
            position: fixed;
            bottom: 0;
            background: rgba(0, 0, 0, 0.28);
            width: 100%;
          }
        </style>
        <script>${vendor}</script>

      </head>
      <body>
      <div id="treemap"></div>
      <div id="group-info"></div>
      <script>
         const treeMap = document.querySelector('#treemap');
         const groupInfo = document.querySelector('#group-info');

         treeMap.style.height = (window.innerHeight - 100) + 'px';
         treeMap.style.width = window.innerWidth + 'px';
         var treemap = new CarrotSearchFoamTree({
            id: 'treemap',
            layout: 'squarified',
            stacking: 'flattened',
            maxGroupLevelsDrawn: Number.MAX_VALUE,
            maxGroupLabelLevelsDrawn: Number.MAX_VALUE,
            groupLabelVerticalPadding: 0.2,
            rolloutDuration: 0,
            pullbackDuration: 0,
            fadeDuration: 0,
            zoomMouseWheelDuration: 300,
            openCloseDuration: 200,
            dataObject: {
              groups: ${JSON.stringify(groups)}
            },
            titleBarDecorator: function (opts, props, vars) {
              vars.titleBarShown = false;
            },

            onGroupClick: function (event) {
              event.preventDefault();
              zoomOutDisabled = false;
              treemap.zoom(event.group);
            },

            onGroupHover: function (event) {
              var group = event.group;

              if (group !== null) {
                setGroupToolInfo(group);
              }
            }
           });


         function getFileInfo(group) {
          const selfSize = document.createTextNode(
            'Self Size ' + (group.fileSize / 1024).toFixed(2) + 'KB');

          const totalSize = document.createTextNode(
            'Total Size ' + (group.weight / 1024).toFixed(2) + 'KB');

          const root = document.createDocumentFragment();

          root.appendChild(selfSize);
          root.appendChild(document.createElement('br'))
          root.appendChild(totalSize);

          return root;
         }


         function setGroupToolInfo(group) {
           groupInfo.innerHTML = '';
           const header = document.createElement('b');
           const fileInfo = document.createElement('div');

           fileInfo.appendChild(getFileInfo(group));
           header.textContent = group.label;
           groupInfo.appendChild(header);
           groupInfo.appendChild(fileInfo);
         }

         window.addEventListener('resize', () => {
           treeMap.style.height = (window.innerHeight - 100) + 'px';
           treeMap.style.width = window.innerWidth + 'px';
           treemap.resize()
         });
      </script>
      </body>
      </html>`
}

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
