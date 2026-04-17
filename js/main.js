/* Mobile Nav Toggle */
const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');
if (toggle && nav) {
    toggle.addEventListener('click', () => {
        toggle.classList.toggle('open');
        nav.classList.toggle('open');
    });
    nav.querySelectorAll('a').forEach(link =>
        link.addEventListener('click', () => {
            toggle.classList.remove('open');
            nav.classList.remove('open');
        })
    );
}

/* Scroll reveal */
const reveals = document.querySelectorAll('.reveal');
if (reveals.length) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
    }, { threshold: 0.15 });
    reveals.forEach(el => observer.observe(el));
}

/* FAQ Accordion */
document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
        const item = btn.parentElement;
        const answer = item.querySelector('.faq-answer');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(i => {
            i.classList.remove('open');
            i.querySelector('.faq-answer').style.maxHeight = null;
        });
        if (!isOpen) {
            item.classList.add('open');
            answer.style.maxHeight = answer.scrollHeight + 'px';
        }
    });
});

/* Active nav link */
const currentPage = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.main-nav a').forEach(a => {
    if (a.getAttribute('href') === currentPage) a.classList.add('active');
});
