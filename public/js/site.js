(function () {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  // Mark the current page in the nav
  var here = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
})();
