document.addEventListener('DOMContentLoaded', () => {
    const postForm = document.getElementById('postForm');
    const postsContainer = document.getElementById('postsContainer');
    const submitBtn = document.getElementById('submitBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const postCountEl = document.getElementById('postCount');
    const nameInput = document.getElementById('username');
    const messageInput = document.getElementById('message');
    const nameCountEl = document.getElementById('nameCount');
    const messageCountEl = document.getElementById('messageCount');
    const toastContainer = document.getElementById('toastContainer');

    const LIMITS = { nameMax: 50, messageMax: 500 };
    let isLoading = false;
    let isSubmitting = false;

    //文字数カウンターの更新
    function updateCharCount(input, counterEl, max) {
        const length = input.value.length;
        counterEl.textContent = `${length} / ${max}`;
        counterEl.classList.toggle('char-count--warning', length >= max * 0.9);
        counterEl.classList.toggle('char-count--danger', length >= max);
    }

    nameInput.addEventListener('input', () => updateCharCount(nameInput, nameCountEl, LIMITS.nameMax));
    messageInput.addEventListener('input', () => updateCharCount(messageInput, messageCountEl, LIMITS.messageMax));
    updateCharCount(nameInput, nameCountEl, LIMITS.nameMax);
    updateCharCount(messageInput, messageCountEl, LIMITS.messageMax);

    //トースト通知の表示
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('toast--visible'));

        setTimeout(() => {
            toast.classList.remove('toast--visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    //相対時間の表示（例: 3分前）
    function formatRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return 'たった今';
        if (diffMin < 60) return `${diffMin}分前`;
        if (diffHour < 24) return `${diffHour}時間前`;
        if (diffDay < 7) return `${diffDay}日前`;
        return date.toLocaleDateString('ja-JP');
    }

    //名前の先頭文字からアバター用イニシャルを生成
    function getInitials(name) {
        const trimmed = name.trim();
        if (!trimmed) return '?';
        return trimmed.charAt(0).toUpperCase();
    }

    //読み込み中のスケルトン表示
    function showLoadingState() {
        postsContainer.setAttribute('aria-busy', 'true');
        postsContainer.innerHTML = `
            <div class="loading-state">
                <div class="spinner" aria-hidden="true"></div>
                <p>投稿を読み込み中...</p>
            </div>
        `;
    }

    //投稿件数の更新
    function updatePostCount(count) {
        postCountEl.textContent = count === 0
            ? '投稿はまだありません'
            : `全 ${count} 件の投稿`;
    }

    //投稿一覧の取得と描画
    async function loadPosts() {
        if (isLoading) return;
        isLoading = true;
        showLoadingState();

        try {
            const response = await fetch('/api/posts');
            if (!response.ok) {
                throw new Error('投稿の取得に失敗しました');
            }

            const posts = await response.json();
            postsContainer.innerHTML = '';
            postsContainer.setAttribute('aria-busy', 'false');
            updatePostCount(posts.length);

            if (posts.length === 0) {
                postsContainer.innerHTML = `
                    <div class="empty-state">
                        <p class="empty-state__title">投稿はまだありません</p>
                        <p class="empty-state__text">上のフォームから最初の投稿をしてみましょう。</p>
                    </div>
                `;
                return;
            }

            posts.forEach(post => {
                const postCard = document.createElement('article');
                postCard.className = 'post-card';
                postCard.dataset.id = post.Id;

                const absoluteDate = new Date(post.CreatedAt).toLocaleString('ja-JP');
                const relativeDate = formatRelativeTime(post.CreatedAt);
                const initials = getInitials(post.Name);

                postCard.innerHTML = `
                    <div class="post-card__body">
                        <div class="post-avatar" aria-hidden="true">${escapeHTML(initials)}</div>
                        <div class="post-content">
                            <div class="post-header">
                                <span class="post-name">${escapeHTML(post.Name)}</span>
                                <time class="post-date" datetime="${post.CreatedAt}" title="${absoluteDate}">
                                    ${relativeDate}
                                </time>
                            </div>
                            <div class="post-message">${escapeHTML(post.Message)}</div>
                        </div>
                    </div>
                    <button type="button" class="btn-delete" data-id="${post.Id}" aria-label="${escapeHTML(post.Name)}さんの投稿を削除">
                        削除
                    </button>
                `;
                postsContainer.appendChild(postCard);
            });

            //削除ボタンのイベント設定
            postsContainer.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', () => deletePost(Number(btn.dataset.id)));
            });
        } catch (error) {
            console.error('エラー:', error);
            postsContainer.setAttribute('aria-busy', 'false');
            postsContainer.innerHTML = `
                <div class="error-state" role="alert">
                    <p class="error-state__title">投稿の読み込みに失敗しました</p>
                    <p class="error-state__text">サーバーが起動しているか確認し、「更新」ボタンで再試行してください。</p>
                </div>
            `;
            updatePostCount(0);
            showToast('投稿の読み込みに失敗しました', 'error');
        } finally {
            isLoading = false;
        }
    }

    //投稿の削除
    async function deletePost(postId) {
        if (!confirm('この投稿を削除しますか？')) return;

        try {
            const response = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                showToast('投稿を削除しました', 'success');
                loadPosts();
            } else {
                showToast(data.error || '削除に失敗しました', 'error');
            }
        } catch (error) {
            console.error('エラー:', error);
            showToast('通信エラーが発生しました', 'error');
        }
    }

    //新規投稿の送信
    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        const payload = {
            name: nameInput.value,
            message: messageInput.value
        };

        isSubmitting = true;
        submitBtn.disabled = true;
        submitBtn.classList.add('btn--loading');

        try {
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                nameInput.value = '';
                messageInput.value = '';
                updateCharCount(nameInput, nameCountEl, LIMITS.nameMax);
                updateCharCount(messageInput, messageCountEl, LIMITS.messageMax);
                showToast('投稿が完了しました', 'success');
                loadPosts();
            } else {
                showToast(data.error || '投稿に失敗しました', 'error');
            }
        } catch (error) {
            console.error('エラー:', error);
            showToast('通信エラーが発生しました', 'error');
        } finally {
            isSubmitting = false;
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn--loading');
        }
    });

    refreshBtn.addEventListener('click', () => {
        showToast('投稿一覧を更新しています', 'info');
        loadPosts();
    });

    //XSS対策: HTMLエスケープ
    function escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    loadPosts();
});
