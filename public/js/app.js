// public/js/app.js
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Aplicación web cargada');

  // Funcionalidad básica del frontend
  const botonesProductos = document.querySelectorAll('.producto-card a');
  
  botonesProductos.forEach(boton => {
    boton.addEventListener('click', function(e) {
      console.log('Navegando a:', this.href);
    });
  });

  // Mostrar mensaje de bienvenida
  if (window.location.pathname === '/') {
    setTimeout(() => {
      console.log('🎉 ¡Bienvenido a Mi Tienda!');
    }, 1000);
  }

  // Lazy loading básico para imágenes (simulado)
  const imagenes = document.querySelectorAll('img[data-src]');
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy');
        imageObserver.unobserve(img);
      }
    });
  });

  imagenes.forEach(img => imageObserver.observe(img));
});