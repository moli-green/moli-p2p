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
