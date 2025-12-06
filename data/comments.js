document.addEventListener("DOMContentLoaded", () => {
  
  const productId = window.location.pathname.split("/").pop();

  const list = document.getElementById("comments-list");
  const form = document.getElementById("comment-form");

  // 1. Cargar comentarios
  function loadComments() {
    fetch(`/api/productos/${productId}/comments`)
      .then(res => res.json())
      .then(data => {
        if (data.length === 0) {
          list.innerHTML = "<p>No hay comentarios aún.</p>";
          return;
        }

        list.innerHTML = data
          .map(c => `
            <div class="comment">
              <strong>${c.author}</strong> — <em>${new Date(c.createdAt).toLocaleString()}</em>
              <p>${c.text}</p>
            </div>
          `)
          .join("");
      });
  }

  loadComments();

  // 2. Enviar comentario
  form.addEventListener("submit", e => {
    e.preventDefault();

    const author = document.getElementById("author").value;
    const text = document.getElementById("text").value;

    fetch(`/api/productos/${productId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, text })
    })
      .then(res => res.json())
      .then(() => {
        form.reset();
        loadComments(); // recargar después de enviar
      });
  });

});
