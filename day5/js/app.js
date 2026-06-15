document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const themeToggleBtn = document.getElementById('theme-toggle');
  const diaryInput = document.getElementById('diary-input');
  const charCountLabel = document.getElementById('char-count');
  const voiceInputBtn = document.getElementById('voice-input-btn');
  const analyzeBtn = document.getElementById('analyze-btn');

  const aiResponseBox = document.getElementById('ai-response-box');
  const responsePlaceholder = document.getElementById('response-placeholder');
  const responseLoading = document.getElementById('response-loading');
  const responseText = document.getElementById('response-text');

  const speechStatus = document.getElementById('speech-status');
  const speechStatusText = document.getElementById('speech-status-text');

  // --- Theme Toggle Setup ---
  const savedTheme = localStorage.getItem('moodlog_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('moodlog_theme', newTheme);
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

  // --- Character Counter ---
  diaryInput.addEventListener('input', () => {
    const currentLength = diaryInput.value.length;
    charCountLabel.textContent = `${currentLength} / 1000`;
  });

  // --- Restore Saved Diary and AI Response ---
  const savedDiaryText = localStorage.getItem('moodlog_diary_text');
  const savedAiResponse = localStorage.getItem('moodlog_ai_response');

  if (savedDiaryText) {
    diaryInput.value = savedDiaryText;
    charCountLabel.textContent = `${savedDiaryText.length} / 1000`;
  }

  if (savedAiResponse) {
    responsePlaceholder.style.display = 'none';
    responseText.style.display = 'block';
    responseText.textContent = savedAiResponse;
  }

  // --- Speech Recognition (STT) Setup ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;
  let voiceInputBuffer = ""; // To store the base text before speech starts
  let silenceTimer = null; // Timer for 5 seconds of silence auto-stop

  function resetSilenceTimer() {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      console.log('5초 동안 입력이 없어 음성 인식을 자동 종료합니다.');
      stopRecording();
    }, 5000);
  }

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR';

    recognition.onstart = () => {
      isRecording = true;
      voiceInputBtn.classList.add('recording');
      voiceInputBtn.querySelector('.btn-text').textContent = '음성 인식 중...';
      speechStatus.classList.add('active');
      speechStatusText.textContent = '음성 인식 활성화...';
      voiceInputBuffer = diaryInput.value;
      resetSilenceTimer(); // Start silence timer
    };

    recognition.onresult = (event) => {
      resetSilenceTimer(); // Reset silence timer on any speech input
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      // Append speech to baseline text
      const separator = voiceInputBuffer && !voiceInputBuffer.endsWith(' ') ? ' ' : '';
      diaryInput.value = voiceInputBuffer + separator + finalTranscript + interimTranscript;
      
      // Update char count
      charCountLabel.textContent = `${diaryInput.value.length} / 1000`;
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert('마이크 접근 권한이 차단되었습니다. 브라우저 설정에서 마이크 사용을 승인해주세요.');
      }
      stopRecording();
    };

    recognition.onend = () => {
      stopRecording();
    };
  } else {
    // Hide or disable microphone button if not supported
    console.warn('SpeechRecognition is not supported in this browser.');
    voiceInputBtn.addEventListener('click', () => {
      alert('사용하시는 브라우저에서는 음성 인식을 지원하지 않습니다. 구글 크롬, 사파리, 엣지 브라우저를 이용해 주세요.');
    });
  }

  function startRecording() {
    if (!recognition) return;
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }

  function stopRecording() {
    isRecording = false;
    voiceInputBtn.classList.remove('recording');
    voiceInputBtn.querySelector('.btn-text').textContent = '음성으로 입력하기';
    speechStatus.classList.remove('active');
    speechStatusText.textContent = '마이크 비활성';
    clearSilenceTimer(); // Clear timer when recording stops
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        // already stopped
      }
    }
  }

  // Bind microphone button click
  if (recognition) {
    voiceInputBtn.addEventListener('click', () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  // --- Emotion Analysis Database & Logic ---
  const AI_RESPONSES = {
    sadness: [
      "오늘 하루 많이 지치고 버거우셨겠어요. 마음속에 담아두기 힘든 슬픔을 이렇게 글로 써 내려간 것만으로도 아주 용기 있는 걸음입니다. 눈물이 나거나 무기력해질 때는 억지로 힘내려 하지 마시고, 푹 쉬는 시간을 가져보세요. 오늘 밤은 따뜻한 차 한 잔 마시며 스스로의 수고를 안아주길 바랄게요. 당신은 언제나 존재 자체로 소중합니다.",
      "마음의 비가 내리는 날이었군요. 글로 적어주신 문장 하나하나에서 깊은 아픔과 고독이 전해져와 제 마음도 시려옵니다. 누구나 무너지고 싶은 날이 있기 마련이에요. 오늘은 조금 더 자신에게 관대해져도 괜찮습니다. 힘든 일은 털어내고, 오늘은 그저 푹 주무시기를 바랍니다. 내일은 아주 조금이라도 더 따뜻한 온기가 스며들기를 기도할게요.",
      "오늘 많이 힘들고 지친 마음이 느껴집니다. 모든 짐을 혼자 짊어지려 애쓰셨군요. 누구나 상처받고 위로가 필요한 때가 있습니다. 지금의 아픈 감정도 자연스러운 흐름 중 하나일 뿐이니, 감정을 부정하지 말고 그대로 마주해 주세요. 마음이 차분해질 때까지 곁에서 가만히 응원하고 있을게요."
    ],
    anger: [
      "오늘 정말 속상하고 화나는 일이 있으셨군요. 문장 속에서 밀려오는 억울함과 분노가 고스란히 느껴집니다. 참지 않고 이렇게 감정을 쏟아내는 것은 마음 건강에 아주 좋은 선택입니다. 잠시 심호흡을 깊게 하며 어깨의 긴장을 풀어보세요. 그 누구도 당신의 마음을 마음대로 상처 입힐 수는 없습니다. 오늘은 차가운 물 한 잔 마시며 불쾌했던 생각들을 멀리 흘려보내 볼까요?",
      "화가 많이 나고 답답했던 상황이 선명하게 그려집니다. 그런 일을 겪으셨다면 누구라도 화가 나고 억울했을 거예요. 감정이 끓어오를 때는 억누르기보다 나만의 안전한 공간에서 발산하는 것이 중요해요. 오늘 있었던 불쾌한 일들은 바람에 날려 보낸다 생각하고, 좋아하는 음악을 크게 들으며 기분을 전환해 보시는 걸 추천합니다. 당신의 평온함을 응원합니다.",
      "스트레스와 화로 꽉 차서 답답했을 하루였네요. 화나는 마음은 자연스러운 방어기제입니다. 자신을 지키기 위해 마음이 소리치고 있는 것이지요. 오늘만큼은 화나게 만든 대상에 대한 생각은 끄고, 오롯이 당신이 좋아하는 편안하고 아늑한 일들에만 집중해 보는 것은 어떨까요? 평화로운 밤이 되기를 바랄게요."
    ],
    joy: [
      "글에서 싱그러운 기쁨과 긍정적인 에너지가 가득 느껴집니다! 오늘 정말 행복하고 즐거운 하루를 보내셨네요. 이렇게 좋은 감정을 일기에 담아두면, 나중에 지칠 때 큰 힘이 되는 보물이 될 거예요. 활짝 웃으셨을 당신의 모습이 그려져 저까지 미소 짓게 됩니다. 이 멋진 기운이 내일까지 쭉 이어져 계속해서 기분 좋은 일들만 가득하시길 진심으로 바랄게요!",
      "와, 축하드려요! 성취감과 뿌듯함이 활자 사이로 춤을 추듯 흘러넘치네요. 사소하지만 반짝이는 일상 속 행복을 발견해 낸 당신의 감수성이 참 아름답습니다. 오늘의 긍정적이고 화사한 기운을 마음속 서랍에 잘 간직해 두세요. 내일도 분명 흥미진진하고 신나는 일들이 당신을 기다리고 있을 것입니다. 언제나 이렇게 밝게 빛나시길 응원합니다!",
      "행복하고 감사한 감정이 가득 찬 하루였군요! 긍정의 에너지를 솔직하게 나누어 주셔서 감사합니다. 기쁘고 보람찬 에너지는 주변 사람들에게도 좋은 선한 영향력을 줍니다. 오늘 느꼈던 소중한 감각들을 충분히 곱씹으며, 달콤하고 편안한 꿈을 꾸며 잠자리에 드시기를 바랄게요."
    ],
    anxiety: [
      "앞으로 다가올 일들에 대한 걱정과 고민으로 머릿속이 복잡해 보이는군요. 불안감은 우리가 더 잘 해내고 싶다는 마음이 클 때 생기곤 합니다. 생각의 꼬리를 물다 보면 마음이 쉽게 지칠 수 있어요. 아직 오지 않은 내일 걱정은 잠시 내려놓고, 지금 숨을 들이쉬고 내쉬며 오롯이 현재에 집중해 보세요. 생각보다 일들은 훨씬 더 지혜롭게 흘러갈 것입니다. 당신을 믿으셔도 좋아요.",
      "불안하고 떨리는 마음에 밤잠을 설치고 계시진 않은지 걱정됩니다. 고민이 깊어질 때는 생각을 정리하려 하기보다, 따뜻한 담요를 덮고 몸의 감각에 귀 기울여 보세요. 당신이 겪고 있는 그 어두운 터널도 결국에는 출구가 나오기 마련입니다. 너무 혼자 짊어지거나 애태우지 마세요. 이미 충분히 잘해왔고, 앞으로도 해낼 힘이 당신 안에 숨어있습니다.",
      "두렵고 불안한 마음에 가슴이 조금 조여왔을지도 모르겠어요. 머리가 복잡할 때는 눈을 감고 편안한 장소를 마음속에 그려보세요. 내일의 문제는 내일의 당신이 잘 해결해 낼 것입니다. 당신은 생각보다 훨씬 더 단단한 사람이에요. 오늘은 걱정 인형에게 모든 불안을 쥐여주고, 깊고 평안한 안식을 취해 보세요."
    ],
    calm: [
      "고요하고 차분한 하루의 마무리에 제 답변이 닿아 기쁩니다. 특별히 나쁜 일도, 그렇다고 엄청나게 들뜨는 일도 없었을지 모르는 평범한 하루이지만, 그 무탈함과 평화가 실은 가장 큰 축복이기도 합니다. 오늘도 큰 탈 없이 묵묵히 본인의 길을 걸어가신 스스로에게 '수고했다'는 한마디를 건네보세요. 고요함 속에서 편안한 꿈 가득한 밤 보내시길 바랍니다.",
      "잔잔한 호수 같은 일상 속에서 나직이 생각들을 써 내려가셨군요. 화려하지는 않아도 한 자 한 자 적힌 글 속에서 삶에 대한 진지함과 평온함이 돋보입니다. 인생은 이런 소소하고 무던한 날들이 모여 아름다운 궤적을 그리게 되죠. 오늘 밤은 가벼운 산책을 하거나 차분한 분위기 속에 수고한 마음을 내려놓고 편히 주무세요.",
      "일과 일상 속에서 차분하게 마음을 가다듬는 모습이 멋집니다. 바쁜 일상에서 한 걸음 물러나 일기를 쓰며 자신을 되돌아보는 시간은 영혼의 휴식처가 됩니다. 오늘 있었던 모든 평범한 행복들에 미소 짓고, 내일도 안정감 있고 기분 좋은 평온함이 함께하기를 바랍니다."
    ]
  };

  // --- Typing Effect Function ---
  let typingTimer = null;
  function typeWriter(text, element, speed = 35) {
    element.innerHTML = "";
    element.style.display = "block";
    let index = 0;
    
    if (typingTimer) clearInterval(typingTimer);

    typingTimer = setInterval(() => {
      if (index < text.length) {
        element.innerHTML += text.charAt(index);
        index++;
      } else {
        clearInterval(typingTimer);
        typingTimer = null;
      }
    }, speed);
  }

  // --- Analyze Emotion & Generate Response ---
  analyzeBtn.addEventListener('click', () => {
    const textValue = diaryInput.value.trim();

    if (!textValue) {
      alert("일기를 먼저 작성해 주세요. 오늘 하루의 이야기를 조금이라도 적은 뒤 분석 요청을 해주세요!");
      diaryInput.focus();
      return;
    }

    // 1. UI States (Show loading)
    responsePlaceholder.style.display = 'none';
    responseText.style.display = 'none';
    responseLoading.style.display = 'flex';
    analyzeBtn.disabled = true;
    voiceInputBtn.disabled = true;

    // Stop voice recognition if recording
    if (isRecording) {
      stopRecording();
    }

    // 2. Request Gemini AI analysis from the server proxy
    fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: textValue })
    })
    .then(function(res) {
      if (!res.ok) {
        return res.json().then(function(err) {
          throw new Error(err.error || '서버 오류가 발생했습니다.');
        }).catch(function() {
          throw new Error('서버와의 통신이 원활하지 않습니다.');
        });
      }
      return res.json();
    })
    .then(function(data) {
      if (data.error) {
        throw new Error(data.error);
      }

      // 3. Update UI (Hide loading, Typewrite response)
      responseLoading.style.display = 'none';
      analyzeBtn.disabled = false;
      voiceInputBtn.disabled = false;
      
      // Save diary content and AI response to local storage
      localStorage.setItem('moodlog_diary_text', textValue);
      localStorage.setItem('moodlog_ai_response', data.response);

      // Run Typing Effect with real Gemini response
      typeWriter(data.response, responseText, 30);
    })
    .catch(function(error) {
      console.error('API Error:', error);
      responseLoading.style.display = 'none';
      analyzeBtn.disabled = false;
      voiceInputBtn.disabled = false;
      
      // Show error message to user
      var errorMsg = "분석 중 오류가 발생했습니다. ";
      if (error.message.indexOf('GEMINI_API_KEY') !== -1) {
        errorMsg += "서버에 'GEMINI_API_KEY' 환경 변수가 설정되어 있지 않습니다. 터미널에서 환경 변수를 설정하고 서버를 재시작해 주세요.";
      } else {
        errorMsg += "네트워크 연결 또는 API 키 상태를 확인해 주세요. (상세 오류: " + error.message + ")";
      }
      typeWriter(errorMsg, responseText, 30);
    });
  });

  // Sentiment Helper Function
  function analyzeSentiment(text) {
    const lowerText = text.toLowerCase();
    
    // Emotion keyword lists
    const sadKeywords = ["슬프", "눈물", "힘들", "우울", "아프", "속상", "지친", "피곤", "외롭", "보고싶", "고독", "아픔", "지쳐", "막막"];
    const angerKeywords = ["화나", "짜증", "분하", "억울", "미워", "싸웠", "스트레스", "욕", "빡쳐", "짜증나", "열받", "불쾌"];
    const joyKeywords = ["기뻐", "행복", "즐거", "신나", "감사", "좋았", "웃음", "성공", "사랑", "꿀잼", "대박", "뿌듯", "성취"];
    const anxietyKeywords = ["걱정", "불안", "두려", "무섭", "떨려", "어쩌지", "고민", "긴장", "초조", "무서워", "막막"];

    // Count hits
    let sadCount = countMatches(lowerText, sadKeywords);
    let angerCount = countMatches(lowerText, angerKeywords);
    let joyCount = countMatches(lowerText, joyKeywords);
    let anxietyCount = countMatches(lowerText, anxietyKeywords);

    const maxCount = Math.max(sadCount, angerCount, joyCount, anxietyCount);

    if (maxCount === 0) {
      return 'calm';
    }

    // Determine leading emotion
    if (maxCount === sadCount) return 'sadness';
    if (maxCount === angerCount) return 'anger';
    if (maxCount === joyCount) return 'joy';
    if (maxCount === anxietyCount) return 'anxiety';

    return 'calm';
  }

  function countMatches(text, keywords) {
    let count = 0;
    keywords.forEach(keyword => {
      let pos = text.indexOf(keyword);
      while (pos !== -1) {
        count++;
        pos = text.indexOf(keyword, pos + 1);
      }
    });
    return count;
  }
});
