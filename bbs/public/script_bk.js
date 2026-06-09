document.addEventListener('DOMContentLoaded', () => {
    const postForm = document.getElementById('postForm');
    const postsContainer = document.getElementById('postsContainer');

    async function loadPosts() {
        try {
            const response = await fetch('/api/posts');
            const posts = await response.json();
            
            postsContainer.innerHTML = '';

            if (posts.length === 0) {
                postsContainer.innerHTML = '<p>投稿はまだありません。</p>';
                return;
            }

            posts.forEach(post => {
                const postCard = document.createElement('div');
                postCard.className = 'post-card';
                
                const date = new Date(post.CreatedAt).toLocaleString('ja-JP');

                postCard.innerHTML = `
                    <div class="post-header">
                        <span class="post-name">${escapeHTML(post.Name)}</span>
                        <span class="post-date">${date}</span>
                    </div>
                    <div class="post-message">${escapeHTML(post.Message)}</div>
                `;
                postsContainer.appendChild(postCard);
            });
        } catch (error) {
            console.error('エラー:', error);
            postsContainer.innerHTML = '<p style="color: red;">投稿の読み込みに失敗しました。</p>';
        }
    }

    postForm.addEventListener('submit', async (e) => {
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
            } else {
                alert('投稿に失敗しました。');
            }
        } catch (error) {
            console.error('エラー:', error);
            alert('通信エラーが発生しました。');
        }
    });

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    loadPosts();
});