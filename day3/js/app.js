document.addEventListener('DOMContentLoaded', () => {
  // --- Config ---
  // 구글 스프레드시트의 [확장 프로그램] > [Apps Script]에 코드를 붙여넣고 웹 앱으로 배포한 URL을 여기에 입력하세요.
  const APPS_SCRIPT_URL = ''; 
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/17_TaBM8R56Bk0HgDWYw3oxtWooS8R2hMrWLtMgjAQl4/export?format=csv';
  
  const MENU_KEYS = ['bibimbap', 'donkatsu', 'gukbap', 'salad'];
  const MENU_DETAILS = {
    bibimbap: { name: '비빔밥', emoji: '🍲', class: 'bibimbap' },
    donkatsu: { name: '돈까스', emoji: '🥩', class: 'donkatsu' },
    gukbap: { name: '국밥', emoji: '🥣', class: 'gukbap' },
    salad: { name: '샐러드', emoji: '🥗', class: 'salad' }
  };

  // --- State Management ---
  let votes = { bibimbap: 0, donkatsu: 0, gukbap: 0, salad: 0 };
  let selectedMenu = null;
  let lastFeedSignature = "";
  
  // Local cache to keep track of user votes cast in this session before they appear in the sheet
  let localSessionFeed = [];
  let sheetFeedCache = [];

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

  // Pre-fill nickname if saved previously
  const savedName = localStorage.getItem('user_lunch_name');
  if (savedName) {
    usernameInput.value = savedName;
  }

  // --- Initial Data Loading & Polling ---
  fetchSheetData(true);
  
  // Poll the sheet every 5 seconds for real-time updates
  const pollingInterval = setInterval(() => {
    fetchSheetData(false);
  }, 5000);

  // --- Event Listeners ---
  menuCards.forEach(card => {
    card.addEventListener('click', () => {
      const menu = card.getAttribute('data-menu');
      
      if (selectedMenu === menu) {
        // Deselect
        selectedMenu = null;
        card.classList.remove('selected');
        voteBtn.disabled = true;
      } else {
        // Select
        menuCards.forEach(c => c.classList.remove('selected'));
        selectedMenu = menu;
        card.classList.add('selected');
        voteBtn.disabled = false;
      }
    });
  });

  voteBtn.addEventListener('click', async () => {
    if (!selectedMenu) return;

    const nickname = usernameInput.value.trim() || '익명';
    localStorage.setItem('user_lunch_name', nickname);

    const votedMenu = selectedMenu;

    // Enter Loading State
    setVoteButtonLoading(true);

    // 1. Instantly update UI locally for responsive feedback
    votes[votedMenu]++;
    updateResultsUI();
    triggerConfetti();

    // 2. Add to local session feed
    localSessionFeed.unshift({
      name: nickname,
      menuKey: votedMenu,
      time: '방금 전'
    });
    renderFeed(sheetFeedCache);

    // 3. Clear card selection state
    menuCards.forEach(c => c.classList.remove('selected'));
    selectedMenu = null;

    // Check if Google Apps Script URL is configured
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL !== 'YOUR_APPS_SCRIPT_URL') {
      try {
        // Send request to Apps Script Web App
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors', // Bypass CORS redirects
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ menu: votedMenu, voter: nickname })
        });

        showTemporaryAlert('🎉 투표가 구글 시트에 저장되었습니다!');
        
        // Immediate fetch to catch up
        setTimeout(() => {
          fetchSheetData(false);
        }, 1500);

      } catch (error) {
        console.error('Error writing to Google Sheet:', error);
        showTemporaryAlert('⚠️ 시트 전송 실패. 네트워크 상태를 확인하세요.');
      } finally {
        setVoteButtonLoading(false);
      }
    } else {
      // Local Fallback Mode (No Apps Script configured)
      printSetupInstructions();
      showTemporaryAlert('💡 로컬 테스트 완료! (구글 시트 저장 가이드는 콘솔을 참조하세요)');
      setVoteButtonLoading(false);
    }
  });

  // --- Setup Loading States ---
  function setVoteButtonLoading(isLoading) {
    if (isLoading) {
      voteBtn.disabled = true;
      voteBtn.innerHTML = '<span>전송 중...</span><span class="btn-pulse"></span>';
      usernameInput.disabled = true;
      menuCards.forEach(c => c.style.pointerEvents = 'none');
    } else {
      voteBtn.disabled = true; // Wait until next selection
      voteBtn.innerHTML = '<span>투표하기</span>';
      usernameInput.disabled = false;
      menuCards.forEach(c => c.style.pointerEvents = 'auto');
    }
  }

  // --- CSV Parser ---
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const parsedVotes = { bibimbap: 0, donkatsu: 0, gukbap: 0, salad: 0 };
    const feedItems = [];

    if (lines.length <= 1) return { votes: parsedVotes, feed: feedItems };
    
    // Extract headers
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
    const menuIdx = headers.indexOf('menu');
    const voterIdx = headers.indexOf('voter');
    const timeIdx = headers.indexOf('timestamp');

    const cleanCell = (cell) => {
      if (!cell) return '';
      return cell.trim().replace(/^["']|["']$/g, '');
    };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',').map(c => c.trim());
      if (cols.length <= Math.max(menuIdx, voterIdx)) continue;

      const menuVal = cols[menuIdx] ? cleanCell(cols[menuIdx]).toLowerCase() : '';
      const voterVal = cols[voterIdx] ? cleanCell(cols[voterIdx]) : '익명';
      const timeVal = cols[timeIdx] ? cleanCell(cols[timeIdx]) : '';

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
      const response = await fetch(`${SHEET_URL}&t=${Date.now()}`);
      if (!response.ok) throw new Error('Sheet data fetch failed');
      const text = await response.text();
      
      const parsed = parseCSV(text);

      // Smart Merge Tally: Update local counts with sheet counts only if the sheet counts are larger.
      // This prevents local user clicks from vanishing while Google Sheets CSV cache is updating.
      MENU_KEYS.forEach(key => {
        if (parsed.votes[key] > votes[key] || isInitial) {
          votes[key] = parsed.votes[key];
        }
      });
      
      updateResultsUI();

      sheetFeedCache = parsed.feed;

      // Render Feed if signature changed
      const feedSignature = JSON.stringify(parsed.feed) + `_local_${localSessionFeed.length}`;
      if (feedSignature !== lastFeedSignature) {
        lastFeedSignature = feedSignature;
        renderFeed(parsed.feed);
      }
    } catch (error) {
      console.error('Error loading Google Sheet data:', error);
      if (isInitial) {
        showTemporaryAlert('구글 시트 투표 정보를 가져오지 못했습니다.');
        updateResultsUI();
      }
    }
  }

  function updateResultsUI() {
    const total = Object.values(votes).reduce((sum, val) => sum + val, 0);
    totalVotesEl.textContent = `${total.toLocaleString()}표`;

    MENU_KEYS.forEach(key => {
      const count = votes[key] || 0;
      const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
      
      document.getElementById(`count-${key}`).textContent = `(${count}표)`;
      document.getElementById(`percent-${key}`).textContent = `${percentage}%`;
      
      const bar = document.getElementById(`bar-${key}`);
      bar.style.width = `${percentage}%`;
    });
  }

  function renderFeed(sheetFeed) {
    feedContainer.innerHTML = '';
    const displayFeed = [];

    // 1. Add user's instant session votes
    localSessionFeed.forEach(item => {
      displayFeed.push(item);
    });

    // 2. Add sheet feed in reverse order (most recent first)
    const reversedFeed = [...sheetFeed].reverse();
    reversedFeed.forEach(item => {
      // De-duplicate: If the sheet has now registered a vote from our localSessionFeed, remove it from localSessionFeed
      const duplicateIdx = localSessionFeed.findIndex(
        l => l.name === item.name && l.menuKey === item.menuKey
      );
      if (duplicateIdx !== -1) {
        localSessionFeed.splice(duplicateIdx, 1);
      }

      let timeText = '방금 전';
      if (item.time) {
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

  // --- Console Guide Printer ---
  function printSetupInstructions() {
    console.log(
      `%c🛠️ Google Sheets Write API 설정 방법 🛠️`,
      'color: #4f46e5; font-size: 16px; font-weight: bold; padding: 4px;'
    );
    console.log(
      `1. 구글 시트 웹페이지로 이동 후, 상단 메뉴에서 [확장 프로그램] > [Apps Script]를 클릭합니다.\n` +
      `2. 열린 코드 에디터의 기존 내용을 모두 지우고 아래의 코드를 붙여넣습니다:\n\n` +
      `--------------------------------------------------\n` +
      `function doPost(e) {\n` +
      `  try {\n` +
      `    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n` +
      `    var data = JSON.parse(e.postData.contents);\n` +
      `    \n` +
      `    var timestamp = new Date();\n` +
      `    var menu = data.menu || "unknown";\n` +
      `    var voter = data.voter || "익명";\n` +
      `    \n` +
      `    var menuMap = {\n` +
      `      "bibimbap": "비빔밥",\n` +
      `      "donkatsu": "돈까스",\n` +
      `      "gukbap": "국밥",\n` +
      `      "salad": "샐러드"\n` +
      `    };\n` +
      `    var menuName = menuMap[menu] || menu;\n` +
      `    \n` +
      `    sheet.appendRow([timestamp, menuName, voter]);\n` +
      `    \n` +
      `    return ContentService.createTextOutput(JSON.stringify({ result: "success" }))\n` +
      `      .setMimeType(ContentService.MimeType.JSON)\n` +
      `      .setHeader("Access-Control-Allow-Origin", "*");\n` +
      `  } catch (error) {\n` +
      `    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: error.toString() }))\n` +
      `      .setMimeType(ContentService.MimeType.JSON)\n` +
      `      .setHeader("Access-Control-Allow-Origin", "*");\n` +
      `  }\n` +
      `}\n` +
      `--------------------------------------------------\n\n` +
      `3. 우측 상단의 [배포] > [새 배포]를 클릭합니다.\n` +
      `4. 유형 선택(톱니바퀴)에서 [웹 앱]을 선택합니다.\n` +
      `5. 설정을 다음과 같이 구성합니다:\n` +
      `   - 설명: 점심 투표 API\n` +
      `   - 다음 사용자 권한으로 실행: 나 (본인의 구글 계정)\n` +
      `   - 액세스 권한이 있는 사용자: 모든 사용자 (Anyone)\n` +
      `6. [배포] 버튼을 누르고, 액세스 승인(Authorize Access) 창이 나오면 본인 계정 선택 및 [Advanced] > [Go to Untitled project (unsafe)] 클릭 후 [Allow]를 눌러 승인합니다.\n` +
      `7. 배포 완료 후 화면에 표시된 [웹 앱 URL]을 복사합니다.\n` +
      `8. day3/js/app.js 파일 맨 위의 APPS_SCRIPT_URL 상수에 해당 URL을 붙여넣으세요.`
    );
  }
});
