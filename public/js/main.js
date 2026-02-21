// Mobile navigation toggle
document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (toggle && navLinks) {
    toggle.addEventListener('click', function() {
      navLinks.classList.toggle('open');
      toggle.classList.toggle('active');
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        navLinks.classList.remove('open');
        toggle.classList.remove('active');
      });
    });
  }

  // Calendar filter buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  const eventCards = document.querySelectorAll('.event-card');

  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const filter = this.dataset.filter;

      filterBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');

      eventCards.forEach(function(card) {
        if (filter === 'all' || card.dataset.type === filter) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  // Auto-dismiss flash messages
  var flashes = document.querySelectorAll('.flash');
  flashes.forEach(function(flash) {
    setTimeout(function() {
      flash.style.transition = 'opacity 0.3s ease';
      flash.style.opacity = '0';
      setTimeout(function() { flash.remove(); }, 300);
    }, 4000);
  });
});
