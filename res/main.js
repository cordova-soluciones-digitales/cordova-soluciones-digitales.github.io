AOS.init({duration: 700, once: true, offset: 60});

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.site-navbar');
    if (window.scrollY > 60) {
        navbar.style.background = 'rgba(15,23,42,0.97)';
        navbar.style.backdropFilter = 'blur(12px)';
    } else {
        navbar.style.background = 'var(--dark)';
        navbar.style.backdropFilter = 'none';
    }
});

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.site-navbar .nav-link[href^="#"]');
window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
        if (window.scrollY >= s.offsetTop - 120) current = s.id;
    });
    navLinks.forEach(l => {
        l.classList.remove('active');
        if (l.getAttribute('href') === '#' + current) l.classList.add('active');
    });
});

// Colapsar el menú hamburguesa al seleccionar cualquier ítem (móvil)
const navMenuEl = document.getElementById('navMenu');
if (navMenuEl) {
    const navMenuCollapse = bootstrap.Collapse.getOrCreateInstance(navMenuEl, {toggle: false});
    navMenuEl.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (navMenuEl.classList.contains('show')) {
                navMenuCollapse.hide();
            }
        });
    });
}