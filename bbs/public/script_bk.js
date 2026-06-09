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
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const autoRefreshToggle = document.getElementById('autoRefreshToggle');
    const rememberNameCheckbox = document.getElementById('rememberName');
    const darkModeBtn = document.getElementById('darkModeBtn');
    const confettiCanvas = document.getElementById('confettiCanvas');

    const LIMITS = { nameMax: 50, messageMax: 500 };
    const REACTION_EMOJIS = ['👍', '🎉', '💡', '❤️', '😂'];
    const STORAGE_KEYS = {
        username: 'bbs_username',
        darkMode: 'bbs_dark_mode',
        autoRefresh: 'bbs_auto_refresh'
    };

    const FORTUNES = [
        '大吉 — 今日のバグはすべて解決するでしょう',
        '中吉 — コードレビューで好評価が得られます',
        '小吉 — コーヒーが美味しい一日になりそう',
        '吉 — 新しいスキルが身につきそうです',
        '末吉 — あと少しの努力で完成です。がんばれ！',
        '招福 — チーム全員で美味しいランチを食べましょう'
    ];

    let isLoading = false;
    let isSubmitting = false;
    let autoRefreshTimer = null;
    let searchDebounceTimer = null;

    // --- ユーティリティ ---

    function updateCharCount(input, counterEl, max) {
        const length = input.value.length;
        counterEl.textContent = `${length} / ${max}`;
        counterEl.classList.toggle('char-count--warning', length >= max * 0.9);
        counterEl.classList.toggle('char-count--danger', length >= max);
    }

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

    function getInitials(name) {
        const trimmed = name.trim();
        if (!trimmed) return '?';
        return trimmed.charAt(0).toUpperCase();
    }

    //名前から一貫したアバター色を生成
    function getAvatarColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 65%, 45%)`;
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    function getRandomFortune() {
        return FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    }

    // --- ローカルストレージ ---

    function loadSavedSettings() {
        const savedName = localStorage.getItem(STORAGE_KEYS.username);
        if (savedName) nameInput.value = savedName;

        if (localStorage.getItem(STORAGE_KEYS.darkMode) === 'true') {
            document.documentElement.setAttribute('data-theme', 'dark');
            darkModeBtn.textContent = '☀️';
        }

        if (localStorage.getItem(STORAGE_KEYS.autoRefresh) === 'true') {
            autoRefreshToggle.checked = true;
            startAutoRefresh();
        }
    }

    function saveUsername() {
        if (rememberNameCheckbox.checked) {
            localStorage.setItem(STORAGE_KEYS.username, nameInput.value.trim());
        } else {
            localStorage.removeItem(STORAGE_KEYS.username);
        }
    }

    // --- 紙吹雪エフェクト（投稿成功時） ---

    function launchConfetti() {
        const ctx = confettiCanvas.getContext('2d');
        const w = confettiCanvas.width = window.innerWidth;
        const h = confettiCanvas.height = window.innerHeight;
        const colors = ['#3498db', '#e74c3c', '#f39c12', '#27ae60', '#9b59b6', '#1abc9c'];
        const particles = Array.from({ length: 80 }, () => ({
            x: w / 2,
            y: h * 0.4,
            vx: (Math.random() - 0.5) * 12,
            vy: Math.random() * -14 - 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 6 + 4,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        }));

        let frame = 0;
        function animate() {
            ctx.clearRect(0, 0, w, h);
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.3;
                p.rotation += p.rotationSpeed;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                ctx.restore();
            });
            frame++;
            if (frame < 90) requestAnimationFrame(animate);
            else ctx.clearRect(0, 0, w, h);
        }
        animate();
    }

    // --- コナミコマンド（隠し機能） ---

    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;

    document.addEventListener('keydown', (e) => {
        if (e.key === konamiCode[konamiIndex]) {
            konamiIndex++;
            if (konamiIndex === konamiCode.length) {
                konamiIndex = 0;
                document.body.classList.add('party-mode');
                showToast('🎮 パーティモード発動！おめでとう！', 'success');
                launchConfetti();
                setTimeout(() => document.body.classList.remove('party-mode'), 5000);
            }
        } else {
            konamiIndex = 0;
        }
    });

    // --- 投稿一覧 ---

    function showLoadingState() {
        postsContainer.setAttribute('aria-busy', 'true');
        postsContainer.innerHTML = `
            <div class="loading-state">
                <div class="spinner" aria-hidden="true"></div>
                <p>投稿を読み込み中...</p>
            </div>
        `;
    }

    function updatePostCount(count, isFiltered) {
        if (count === 0) {
            postCountEl.textContent = isFiltered ? '検索結果はありません' : '投稿はまだありません';
        } else {
            postCountEl.textContent = isFiltered
                ? `検索結果: ${count} 件`
                : `全 ${count} 件の投稿`;
        }
    }

    function buildReactionsHTML(postId, reactions) {
        const counts = reactions || {};
        const buttons = REACTION_EMOJIS.map(emoji => {
            const count = counts[emoji] || 0;
            const active = count > 0 ? ' reaction-btn--active' : '';
            return `<button type="button" class="reaction-btn${active}" data-id="${postId}" data-emoji="${emoji}" title="${emoji}でリアクション">
                ${emoji}<span class="reaction-count">${count > 0 ? count : ''}</span>
            </button>`;
        }).join('');
        return `<div class="post-reactions">${buttons}</div>`;
    }

    async function loadPosts() {
        if (isLoading) return;
        isLoading = true;
        showLoadingState();

        const search = searchInput.value.trim();
        const sort = sortSelect.value;
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (sort) params.set('sort', sort);

        try {
            const url = `/api/posts${params.toString() ? '?' + params.toString() : ''}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('投稿の取得に失敗しました');

            const posts = await response.json();
            postsContainer.innerHTML = '';
            postsContainer.setAttribute('aria-busy', 'false');
            updatePostCount(posts.length, !!search);

            if (posts.length === 0) {
                postsContainer.innerHTML = `
                    <div class="empty-state">
                        <p class="empty-state__title">${search ? '検索結果はありません' : '投稿はまだありません'}</p>
                        <p class="empty-state__text">${search ? '別のキーワードで試してみてください。' : '上のフォームから最初の投稿をしてみましょう。'}</p>
                    </div>
                `;
                return;
            }

            posts.forEach((post, index) => {
                const postCard = document.createElement('article');
                postCard.className = 'post-card';
                postCard.style.animationDelay = `${index * 0.05}s`;
                postCard.dataset.id = post.Id;

                const absoluteDate = new Date(post.CreatedAt).toLocaleString('ja-JP');
                const relativeDate = formatRelativeTime(post.CreatedAt);
                const initials = getInitials(post.Name);
                const avatarColor = getAvatarColor(post.Name);

                postCard.innerHTML = `
                    <div class="post-card__body">
                        <div class="post-avatar" style="background: ${avatarColor}" aria-hidden="true">${escapeHTML(initials)}</div>
                        <div class="post-content">
                            <div class="post-header">
                                <span class="post-name">${escapeHTML(post.Name)}</span>
                                <time class="post-date" datetime="${post.CreatedAt}" title="${absoluteDate}">
                                    ${relativeDate}
                                </time>
                            </div>
                            <div class="post-message">${escapeHTML(post.Message)}</div>
                            ${buildReactionsHTML(post.Id, post.Reactions)}
                        </div>
                    </div>
                    <div class="post-actions">
                        <button type="button" class="btn-copy" title="本文をコピー">📋</button>
                        <button type="button" class="btn-delete" data-id="${post.Id}" aria-label="${escapeHTML(post.Name)}さんの投稿を削除">削除</button>
                    </div>
                `;
                postsContainer.appendChild(postCard);
            });

            postsContainer.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', () => deletePost(Number(btn.dataset.id)));
            });

            postsContainer.querySelectorAll('.btn-copy').forEach(btn => {
                btn.addEventListener('click', () => {
                    const message = btn.closest('.post-card')?.querySelector('.post-message')?.textContent || '';
                    copyMessage(message);
                });
            });

            postsContainer.querySelectorAll('.reaction-btn').forEach(btn => {
                btn.addEventListener('click', () => reactToPost(Number(btn.dataset.id), btn.dataset.emoji));
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
            updatePostCount(0, false);
            showToast('投稿の読み込みに失敗しました', 'error');
        } finally {
            isLoading = false;
        }
    }

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

    async function reactToPost(postId, emoji) {
        try {
            const response = await fetch(`/api/posts/${postId}/react`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji })
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                const card = postsContainer.querySelector(`.post-card[data-id="${postId}"]`);
                if (card) {
                    const reactionsEl = card.querySelector('.post-reactions');
                    if (reactionsEl) reactionsEl.outerHTML = buildReactionsHTML(postId, data.reactions);
                    card.querySelectorAll('.reaction-btn').forEach(btn => {
                        btn.addEventListener('click', () => reactToPost(Number(btn.dataset.id), btn.dataset.emoji));
                    });
                }
            } else {
                showToast(data.error || 'リアクションに失敗しました', 'error');
            }
        } catch (error) {
            console.error('エラー:', error);
            showToast('通信エラーが発生しました', 'error');
        }
    }

    function copyMessage(message) {
        navigator.clipboard.writeText(message).then(() => {
            showToast('本文をコピーしました', 'success');
        }).catch(() => {
            showToast('コピーに失敗しました', 'error');
        });
    }

    // --- 投稿送信 ---

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
                saveUsername();
                messageInput.value = '';
                updateCharCount(messageInput, messageCountEl, LIMITS.messageMax);
                launchConfetti();
                showToast('投稿が完了しました', 'success');
                setTimeout(() => showToast(`🎋 おみくじ: ${getRandomFortune()}`, 'info'), 800);
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

    // --- イベントリスナー ---

    nameInput.addEventListener('input', () => updateCharCount(nameInput, nameCountEl, LIMITS.nameMax));
    messageInput.addEventListener('input', () => updateCharCount(messageInput, messageCountEl, LIMITS.messageMax));
    updateCharCount(nameInput, nameCountEl, LIMITS.nameMax);
    updateCharCount(messageInput, messageCountEl, LIMITS.messageMax);

    messageInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            postForm.requestSubmit();
        }
    });

    refreshBtn.addEventListener('click', () => {
        showToast('投稿一覧を更新しています', 'info');
        loadPosts();
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(loadPosts, 300);
    });

    sortSelect.addEventListener('change', loadPosts);

    autoRefreshToggle.addEventListener('change', () => {
        if (autoRefreshToggle.checked) {
            localStorage.setItem(STORAGE_KEYS.autoRefresh, 'true');
            startAutoRefresh();
            showToast('30秒ごとに自動更新します', 'info');
        } else {
            localStorage.removeItem(STORAGE_KEYS.autoRefresh);
            stopAutoRefresh();
        }
    });

    darkModeBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            darkModeBtn.textContent = '🌙';
            localStorage.removeItem(STORAGE_KEYS.darkMode);
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            darkModeBtn.textContent = '☀️';
            localStorage.setItem(STORAGE_KEYS.darkMode, 'true');
        }
    });

    function startAutoRefresh() {
        stopAutoRefresh();
        autoRefreshTimer = setInterval(loadPosts, 30000);
    }

    function stopAutoRefresh() {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }
    }

    loadSavedSettings();
    loadPosts();
});
