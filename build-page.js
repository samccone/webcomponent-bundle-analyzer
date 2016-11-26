var page = require('./template/page.tpl.html');

function buildPage(vendor, groups) {
  return page(vendor, JSON.stringify(groups));
}

module.exports = buildPage;
