/* Which copy of the app this is. Here: the copy kept in a GitHub repository, read from data/*.json. */
window.FARE_MODE = 'repo';
(function () {
  var add = function (rel, href) { var l = document.createElement('link'); l.rel = rel; l.href = href; document.head.appendChild(l); };
  add('manifest', 'manifest.webmanifest');
  add('apple-touch-icon', 'icon-192.png');
  add('icon', 'icon-192.png');
})();
