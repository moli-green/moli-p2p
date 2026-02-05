/* @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0-or-later */
window.onerror = function (msg, url, line, col, error) {
    var div = document.getElementById('global-error');
    div.style.display = 'block';
    div.innerHTML = '<h3>Startup Error</h3>' + msg + '<br>' + url + ':' + line + ':' + col;
};
window.addEventListener('unhandledrejection', function (event) {
    var div = document.getElementById('global-error');
    div.style.display = 'block';
    div.innerHTML += '<br><h3>Promise Rejection</h3>' + event.reason;
});
