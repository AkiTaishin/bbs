/**
 * qa_mentor.js — メンター用 Q&A 集のインタラクション
 *
 * qa_mentor.html から読み込まれます。目次ジャンプ、キーワード検索、
 * スクロール連動ハイライト、モバイル目次の開閉を担当します。
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 要素 ---
    const searchInput = document.getElementById('qaSearch');
    const toc = document.getElementById('qaToc');
    const tocToggle = document.getElementById('tocToggle');
    const tocOverlay = document.getElementById('tocOverlay');
    const noResult = document.getElementById('qaNoResult');
    const qaItems = document.querySelectorAll('.qa-item');
    const tocLinks = document.querySelectorAll('.qa-toc a[data-target]');

    // 目次クリックでスムーズスクロール＆モバイル目次を閉じる
    tocLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.getElementById(link.dataset.target);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', '#' + link.dataset.target);
            }
            closeToc();
        });
    });

    // 検索フィルター
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        let visibleCount = 0;

        qaItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            const match = !query || text.includes(query);
            item.classList.toggle('hidden', !match);
            if (match) visibleCount++;
        });

        document.querySelectorAll('.qa-toc__item').forEach(li => {
            const link = li.querySelector('a');
            const targetId = link?.dataset.target;
            const target = targetId ? document.getElementById(targetId) : null;
            const match = !query || (target && !target.classList.contains('hidden'));
            link?.classList.toggle('hidden', !match);
        });

        noResult.classList.toggle('visible', query && visibleCount === 0);
    });

    // スクロール連動で目次をハイライト
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                tocLinks.forEach(link => {
                    link.classList.toggle('active', link.dataset.target === id);
                });
            }
        });
    }, { rootMargin: '-20% 0px -70% 0px' });

    qaItems.forEach(item => observer.observe(item));

    // モバイル目次トグル
    function openToc() {
        toc.classList.add('open');
        tocOverlay.classList.add('open');
    }

    function closeToc() {
        toc.classList.remove('open');
        tocOverlay.classList.remove('open');
    }

    tocToggle.addEventListener('click', () => {
        toc.classList.contains('open') ? closeToc() : openToc();
    });

    tocOverlay.addEventListener('click', closeToc);

    // URLハッシュから直接ジャンプ
    if (location.hash) {
        const target = document.getElementById(location.hash.slice(1));
        if (target) {
            setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }
});
