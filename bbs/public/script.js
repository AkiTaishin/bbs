document.addEventListener('DOMContentLoaded', function() {
    const postForm = document.getElementById('postForm');
    const postsContainer = document.getElementById('postsContainer');

    async function loadPosts() {
        try {
            const response = await fetch('/api/posts');
            const posts = await response.json();
            
            postsContainer.innerHTML = '';

            for (let i = 0; i < posts.length; i++) {
                const post = posts[i];
                const postCard = document.createElement('div');
                postCard.className = 'post-item';
                
                const date = new Date(post.CreatedAt).toLocaleString('ja-JP');

                postCard.innerHTML = `
                    <div class="post-info">
                        <span>${escapeHTML(post.Name)}</span> | <span>${date}</span>
                    </div>
                    <div>${escapeHTML(post.Message)}</div>
                `;
                postsContainer.appendChild(postCard);
            }
        } catch (error) {
            console.error(error);
        }
    }

    postForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const nameInput = document.getElementById('username');
        const messageInput = document.getElementById('message');

        const payload = {
            name: nameInput.value,
            message: messageInput.value
        };

        try {
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                nameInput.value = '';
                messageInput.value = '';
                loadPosts();
            }
        } catch (error) {
            console.error(error);
        }
    });

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, function(tag) {
            const tags = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
            return tags[tag] || tag;
        });
    }

    loadPosts();
});