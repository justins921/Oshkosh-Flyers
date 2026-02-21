document.addEventListener('DOMContentLoaded', function() {

  // ===== Navbar scroll effect =====
  var navbar = document.getElementById('navbar');
  if (navbar) {
    var scrollThreshold = 50;
    function updateNavbar() {
      if (window.scrollY > scrollThreshold) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
    window.addEventListener('scroll', updateNavbar, { passive: true });
    updateNavbar();
  }

  // ===== Mobile navigation toggle =====
  var toggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');

  if (toggle && navLinks) {
    toggle.addEventListener('click', function() {
      navLinks.classList.toggle('open');
      toggle.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        navLinks.classList.remove('open');
        toggle.classList.remove('active');
      });
    });

    // Close on outside click
    document.addEventListener('click', function(e) {
      if (!toggle.contains(e.target) && !navLinks.contains(e.target)) {
        navLinks.classList.remove('open');
        toggle.classList.remove('active');
      }
    });
  }

  // ===== Scroll reveal animations =====
  var revealElements = document.querySelectorAll('.reveal');
  if (revealElements.length > 0) {
    var revealObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(function(el) {
      revealObserver.observe(el);
    });
  }

  // ===== Calendar filter buttons =====
  var filterBtns = document.querySelectorAll('.filter-btn');
  var eventCards = document.querySelectorAll('.event-card');

  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var filter = this.dataset.filter;

      filterBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');

      eventCards.forEach(function(card) {
        if (filter === 'all' || card.dataset.type === filter) {
          card.classList.remove('hidden');
          card.style.animation = 'fadeInUp 0.3s ease forwards';
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  // ===== Flash messages =====
  var flashes = document.querySelectorAll('.flash');
  flashes.forEach(function(flash) {
    // Close button
    var closeBtn = flash.querySelector('.flash-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        flash.style.animation = 'slideUp 0.3s ease forwards';
        setTimeout(function() { flash.remove(); }, 300);
      });
    }
    // Auto dismiss
    setTimeout(function() {
      if (flash.parentNode) {
        flash.style.animation = 'slideUp 0.3s ease forwards';
        setTimeout(function() { if (flash.parentNode) flash.remove(); }, 300);
      }
    }, 5000);
  });

  // ===== Active nav link highlighting =====
  var currentPath = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(function(link) {
    var href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '/' && href === '/')) {
      link.classList.add('nav-active');
    }
  });

  // ===== Smooth counter animation for stats =====
  var statNumbers = document.querySelectorAll('.stat-number');
  if (statNumbers.length > 0) {
    var statsObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var text = el.textContent.trim();
          var num = parseInt(text);
          if (!isNaN(num) && num > 0 && num < 10000) {
            animateCounter(el, num);
          }
          statsObserver.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    statNumbers.forEach(function(el) {
      statsObserver.observe(el);
    });
  }

  function animateCounter(el, target) {
    var suffix = el.textContent.replace(String(target), '');
    var duration = 1200;
    var start = 0;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.floor(eased * target);
      el.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target + suffix;
      }
    }
    requestAnimationFrame(step);
  }

});
