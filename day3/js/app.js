document.addEventListener('DOMContentLoaded', () => {
  // --- State & Config ---
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/17_TaBM8R56Bk0HgDWYw3oxtWooS8R2hMrWLtMgjAQl4/export?format=csv';
  const MENU_KEYS = ['bibimbap', 'donkatsu', 'gukbap', 'salad'];
  
  const MENU_DETAILS = {
    bibimbap: { name: '비빔밥', emoji: '🍲', class: 'bibimbap' },
    donkatsu: { name: '돈까스', emoji: '🥩', class: 'donkatsu' },
    gukbap: { name: '국밥', emoji: '🥣', class: 'gukbap' },
    salad: { name: '샐러드', emoji: '🥗', class: 'salad' }
  };

  let votes = { bibimbap: 0, donkatsu: 0, gukbap: 0, salad: 0 };
  let userVote = localStorage.getItem('user_lunch_vote') || null;
  let selectedMenu = null;
  let lastFeedSignature = "";

  // --- DOM Elements ---
  const menuCards = document.querySelectorAll('.menu-card');
  const voteBtn = document.getElementById('vote-btn');
  const usernameInput = document.getElementById('username');
  const totalVotesEl = document.getElementById('total-votes');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const feedContainer = document.getElementById('feed-container');

  // --- Theme Toggle Setup ---
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeUI(newTheme);
  });

  function updateThemeUI(theme) {
    const icon = themeToggleBtn.querySelector('.theme-icon');
    const text = themeToggleBtn.querySelector('.theme-text');
    if (theme === 'dark') {
      icon.textContent = '☀️';
      text.textContent = '라이트 모드';
    } else {
      icon.textContent = '🌙';
      text.textContent = '다크 모드';
    }
  }

  // --- Initial Rendering & Polling ---
  // Load initial data from Google Sheet
  fetchSheetData(true);
  
  // Poll the sheet every 5 seconds for real-time updates
  const pollingInterval = setInterval(() => {
    fetchSheetData(false);
  }, 5000);

  // If user has already voted, reflect selection in UI
  if (userVote) {
    selectedMenu = userVote;
    const card = document.querySelector(`.menu-card[data-menu="${userVote}"]`);
    if (card) card.classList.add('selected');
    
    const savedName = localStorage.getItem('user_lunch_name');
    if (savedName) usernameInput.value = savedName;
    
    updateVoteButtonState(true);
  }

  // --- Event Listeners ---
  menuCards.forEach(card => {
    card.addEventListener('click', () => {
      if (userVote) {
        showTemporaryAlert('이미 투표 완료되었습니다! 내일 다시 참여해 주세요.');
        return;
      }

      const menu = card.getAttribute('data-menu');
      menuCards.forEach(c => c.classList.remove('selected'));
      
      if (selectedMenu === menu) {
        selectedMenu = null;
        voteBtn.disabled = true;
      } else {
        selectedMenu = menu;
        card.classList.add('selected');
        voteBtn.disabled = false;
      }
    });
  });

  voteBtn.addEventListener('click', () => {
    if (!selectedMenu || userVote) return;

    const nickname = usernameInput.value.trim() || '익명';
    
    // Save locally
    userVote = selectedMenu;
    localStorage.setItem('user_lunch_vote', selectedMenu);
    localStorage.setItem('user_lunch_name', nickname);

    // Visual updates
    triggerConfetti();
    updateVoteButtonState(true);
    showTemporaryAlert('🎉 투표해 주셔서 감사합니다! 결과가 반영되었습니다.');

    // Fetch immediately to merge user vote and redraw
    fetchSheetData(false);
  });

  // --- CSV Parser ---
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const parsedVotes = { bibimbap: 0, donkatsu: 0, gukbap: 0, salad: 0 };
    const feedItems = [];

    if (lines.length <= 1) return { votes: parsedVotes, feed: feedItems };
    
    // Extract headers
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const menuIdx = headers.indexOf('menu');
    const voterIdx = headers.indexOf('voter');
    const timeIdx = headers.indexOf('timestamp');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',').map(c => c.trim());
      if (cols.length <= Math.max(menuIdx, voterIdx)) continue;

      const menuVal = cols[menuIdx] ? cols[menuIdx].toLowerCase() : '';
      const voterVal = cols[voterIdx] || '익명';
      const timeVal = cols[timeIdx] || '';

      let key = null;
      if (menuVal === '비빔밥' || menuVal === 'bibimbap') key = 'bibimbap';
      else if (menuVal === '돈까스' || menuVal === 'donkatsu' || menuVal === '돈카츠') key = 'donkatsu';
      else if (menuVal === '국밥' || menuVal === 'gukbap') key = 'gukbap';
      else if (menuVal === '샐러드' || menuVal === 'salad') key = 'salad';

      if (key) {
        parsedVotes[key]++;
        feedItems.push({
          name: voterVal,
          menuKey: key,
          time: timeVal
        });
      }
    }

    return { votes: parsedVotes, feed: feedItems };
  }

  // --- Fetch Sheet Data ---
  async function fetchSheetData(isInitial = false) {
    try {
      // Add a timestamp parameter to prevent cache
      const response = await fetch(`${SHEET_URL}&t=${Date.now()}`);
      if (!response.ok) throw new Error('Sheet data fetch failed');
      const text = await response.text();
      
      const parsed = parseCSV(text);

      // Merge user vote locally if they have voted (adds +1 to the local tally)
      if (userVote) {
        parsed.votes[userVote] = (parsed.votes[userVote] || 0) + 1;
      }

      votes = parsed.votes;
      updateResultsUI();

      // Render Feed if signature changed (new entries)
      const feedSignature = JSON.stringify(parsed.feed) + (userVote ? `_user_${userVote}` : '');
      if (feedSignature !== lastFeedSignature) {
        lastFeedSignature = feedSignature;
        renderFeed(parsed.feed);
      }
    } catch (error) {
      console.error('Error loading Google Sheet data:', error);
      if (isInitial) {
        showTemporaryAlert('구글 시트 투표 정보를 가져오지 못했습니다.');
        updateResultsUI(); // Show zeros or defaults
      }
    }
  }

  // --- Helper Functions ---

  function updateVoteButtonState(voted) {
    if (voted) {
      voteBtn.disabled = true;
      voteBtn.innerHTML = '<span>투표 완료 ✓</span>';
      voteBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      voteBtn.style.boxShadow = '0 10px 25px -5px rgba(16, 185, 129, 0.4)';
      usernameInput.disabled = true;
    }
  }

  function updateResultsUI() {
    const total = Object.values(votes).reduce((sum, val) => sum + val, 0);
    totalVotesEl.textContent = `${total.toLocaleString()}표`;

    MENU_KEYS.forEach(key => {
      const count = votes[key] || 0;
      const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
      
      // Update text values
      document.getElementById(`count-${key}`).textContent = `(${count}표)`;
      document.getElementById(`percent-${key}`).textContent = `${percentage}%`;
      
      // Update progress bar width
      const bar = document.getElementById(`bar-${key}`);
      bar.style.width = `${percentage}%`;
    });
  }

  function renderFeed(sheetFeed) {
    feedContainer.innerHTML = '';
    const displayFeed = [];

    // 1. If user voted locally, add their vote to the top
    if (userVote) {
      const savedName = localStorage.getItem('user_lunch_name') || '익명';
      displayFeed.push({
        name: savedName,
        menuKey: userVote,
        time: '방금 전'
      });
    }

    // 2. Add sheet feed in reverse order (most recent first)
    const reversedFeed = [...sheetFeed].reverse();
    reversedFeed.forEach(item => {
      let timeText = '방금 전';
      if (item.time) {
        // Extract time from YYYY-MM-DD HH:MM:SS or display as is
        timeText = item.time.includes(' ') ? item.time.split(' ')[1] : item.time;
      }
      displayFeed.push({
        name: item.name,
        menuKey: item.menuKey,
        time: timeText
      });
    });

    const top3 = displayFeed.slice(0, 3);

    if (top3.length === 0) {
      feedContainer.innerHTML = `
        <div class="feed-item" style="justify-content: center; color: var(--text-muted);">
          <span>아직 등록된 투표 데이터가 없습니다.</span>
        </div>
      `;
      return;
    }

    top3.forEach(item => {
      const details = MENU_DETAILS[item.menuKey];
      if (!details) return;

      const feedItem = document.createElement('div');
      feedItem.className = 'feed-item';
      
      const firstChar = item.name.charAt(0);

      feedItem.innerHTML = `
        <div class="feed-user-details">
          <div class="feed-user-avatar">${firstChar}</div>
          <div>
            <span class="feed-user-name">${item.name}</span>
            <span class="feed-action-text">님이 선택함:</span>
          </div>
        </div>
        <span class="feed-menu-badge ${details.class}">${details.emoji} ${details.name}</span>
        <span class="feed-time">${item.time}</span>
      `;
      feedContainer.appendChild(feedItem);
    });
  }

  // --- Confetti Generation ---
  function triggerConfetti() {
    const colors = ['#4f46e5', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    const particleCount = 70;
    
    for (let i = 0; i < particleCount; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const size = Math.floor(Math.random() * 8) + 6;
      const duration = (Math.random() * 2) + 2;
      const delay = Math.random() * 0.4;
      
      confetti.style.backgroundColor = color;
      confetti.style.left = `${left}%`;
      confetti.style.width = `${size}px`;
      confetti.style.height = `${size}px`;
      confetti.style.animationDuration = `${duration}s`;
      confetti.style.animationDelay = `${delay}s`;
      
      if (Math.random() > 0.5) {
        confetti.style.borderRadius = '50%';
      }
      
      document.body.appendChild(confetti);
      
      setTimeout(() => {
        confetti.remove();
      }, (duration + delay) * 1000);
    }
  }

  // --- Toast/Alert Helper ---
  function showTemporaryAlert(message) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.background = 'rgba(15, 23, 42, 0.9)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '99px';
    toast.style.fontSize = '0.9rem';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    toast.style.zIndex = '1000';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
    toast.style.border = '1px solid rgba(255,255,255,0.1)';
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
      toast.style.opacity = '1';
    }, 50);

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }
});
