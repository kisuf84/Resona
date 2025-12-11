// api/analyze.js
// Vercel Serverless Function for RESONA with Genius API integration

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { artists, songs, topGenre, minutesListened, genreCount, specialDay, language } = req.body;

    // Validate input
    if (!artists || !songs || !topGenre || !minutesListened) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get API keys from environment variables
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const GENIUS_API_KEY = process.env.GENIUS_API_KEY;
    
    if (!ANTHROPIC_API_KEY) {
      console.error('Missing ANTHROPIC_API_KEY');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Fetch lyrical themes from Genius API
    let lyricsData = [];
    if (GENIUS_API_KEY) {
      console.log('Fetching lyrics from Genius...');
      lyricsData = await fetchLyricsFromGenius(songs, artists, GENIUS_API_KEY);
    }

    // Build the analysis prompt
    const languageInstruction = {
      en: "Respond in English",
      es: "Responde en Español",
      fr: "Répondez en Français"
    }[language || 'en'];

    const lyricsSection = lyricsData.length > 0 
      ? `\n\nLYRICAL THEMES FOUND:\n${lyricsData.map(l => `"${l.song}" by ${l.artist}: ${l.themes}`).join('\n')}`
      : '';

    const prompt = `You are a cultural sociologist and behavioral researcher for RESONA. Analyze music listening data to reveal sociological and psychological patterns. ${languageInstruction}.

DATA:
- Top Artists: ${artists.join(', ')}
- Top Songs: ${songs.join(', ')}
- Primary Genre: ${topGenre}
- Listening Volume: ${minutesListened} minutes
- Genre Diversity: ${genreCount || 'Not specified'} genres
- Notable Pattern: ${specialDay || 'None provided'}${lyricsSection}

CRITICAL INSTRUCTIONS:

Write with PRECISION and DEPTH. Reference actual sociological and psychological frameworks when data supports them. Be direct and insightful, not verbose or horoscope-like. Use data points as evidence. NO em-dashes. Short, powerful sentences.

Provide exactly FIVE sections (2-3 concise paragraphs each):

1. LYRICAL LANDSCAPE
${lyricsData.length > 0 ? 'Analyze lyrical themes. ' : ''}What emotional territories do they explore? Calculate theme distribution: freedom vs connection (X%), past vs future orientation (X%), joy vs melancholy (X%). Reference specific artists/songs as evidence. If data suggests integrative complexity (ability to hold multiple perspectives simultaneously), name it explicitly.

2. EMOTIONAL OPERATING SYSTEM
How do they use music functionally? Apply relevant frameworks: Self-Determination Theory (autonomy/competence/relatedness needs), Flow State Theory (Csikszentmihalyi), Mood Regulation strategies. Reference their ${minutesListened} minutes and ${genreCount || 'diverse'} genres as concrete data. If ${genreCount || 20}+ genres suggests they're building cosmopolitan cultural capital, state it directly.

3. STRESS SIGNATURE
Analyze ${artists[0]} as their anchor. What does this reveal about attachment style and self-regulation patterns? Use concepts: temporal self-orientation, emotional sophistication, affect regulation. Be specific about what coping mechanisms the data reveals. Evidence-based, not generic.

4. IDENTITY ANCHORS
What are they holding onto vs reaching for? If ${genreCount || 20}+ genres suggests identity portfolio diversification, reference that sociological concept explicitly. Use their actual listening patterns as evidence. Make insights feel EARNED through data, not assumed.

5. FUTURE SELF
CRITICAL SECTION. Don't just recommend similar music. Analyze growth edges: Where is the discomfort that signals transformation? What perspectives are they NOT accessing? How can music help them reach integrative complexity and break echo chambers? Give 3-4 specific growth pathways based on DATA GAPS (not just preferences). Focus on becoming, not just being.

TONE: Direct, insightful, evidence-based. Like a respected researcher who sees patterns others miss. Use sociology/psychology terms when data warrants it (cosmopolitan cultural capital, integrative complexity, flow states, identity portfolio diversification, emotional sophistication). Be personal through precision, not verbosity.`;

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4500,
        temperature: 0.8,
        messages: [{ role: "user", content: prompt }],
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API Error:', errorData);
      return res.status(500).json({ error: 'Analysis failed', details: 'AI service error' });
    }

    const result = await response.json();
    const analysisText = result.content[0].text;

    // Parse sections
    const sections = parseAnalysis(analysisText);

    // Generate artwork data
    const artworkData = generateArtworkData(sections, { topGenre, minutesListened, genreCount });

    return res.status(200).json({
      success: true,
      analysis: sections,
      artwork: artworkData,
      hasLyrics: lyricsData.length > 0
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
}

// Fetch song themes from Genius API
async function fetchLyricsFromGenius(songs, artists, apiKey) {
  const lyricsData = [];
  
  try {
    for (let i = 0; i < Math.min(songs.length, 3); i++) {
      const song = songs[i];
      const artist = artists[Math.min(i, artists.length - 1)];
      
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(song + ' ' + artist)}`;
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      if (!searchResponse.ok) continue;
      
      const searchData = await searchResponse.json();
      const hit = searchData.response?.hits?.[0];
      
      if (hit && hit.result) {
        const themes = extractThemesFromMetadata(song, artist, hit.result);
        lyricsData.push({
          song: song,
          artist: artist,
          themes: themes,
          url: hit.result.url
        });
      }
    }
  } catch (error) {
    console.error('Genius API error:', error);
  }
  
  return lyricsData;
}

// Extract themes from song metadata
function extractThemesFromMetadata(song, artist, geniusData) {
  const themes = [];
  const text = (song + ' ' + artist + ' ' + (geniusData.title || '')).toLowerCase();
  
  const themeKeywords = {
    'love & romance': ['love', 'heart', 'baby', 'girl', 'boy', 'kiss', 'together', 'forever'],
    'celebration & joy': ['party', 'dance', 'night', 'vibe', 'energy', 'alive', 'celebrate'],
    'introspection': ['feel', 'think', 'know', 'wonder', 'soul', 'mind', 'alone'],
    'freedom & liberation': ['free', 'fly', 'run', 'escape', 'away', 'break', 'wild'],
    'nostalgia & memory': ['remember', 'back', 'used', 'was', 'memory', 'time', 'past'],
    'struggle & resilience': ['fight', 'pain', 'hard', 'struggle', 'battle', 'survive', 'strong'],
    'cultural identity': ['home', 'roots', 'culture', 'people', 'world', 'belong'],
    'desire & longing': ['want', 'need', 'wish', 'dream', 'hope', 'waiting']
  };
  
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      themes.push(theme);
    }
  }
  
  return themes.length > 0 ? themes.join(', ') : 'emotional expression, personal narrative';
}

// Generate artwork parameters from analysis
function generateArtworkData(analysis, musicData) {
  const allText = Object.values(analysis).join(' ').toLowerCase();
  
  // Analyze emotional markers
  const emotionalMarkers = {
    joy: ['joy', 'celebrat', 'happy', 'vibrant', 'energy', 'alive', 'excitement'],
    melancholy: ['melancholy', 'reflect', 'nostalgia', 'past', 'memory', 'longing'],
    freedom: ['freedom', 'liberat', 'escape', 'independent', 'breaking', 'wild'],
    connection: ['connection', 'belong', 'roots', 'anchor', 'home', 'together'],
    exploration: ['explor', 'diversity', 'curious', 'seeking', 'discover', 'journey']
  };
  
  const scores = {};
  for (const [emotion, markers] of Object.entries(emotionalMarkers)) {
    scores[emotion] = markers.reduce((count, marker) => 
      count + (allText.match(new RegExp(marker, 'g')) || []).length, 0
    );
  }
  
  // Genre-based color palettes
  const genrePalettes = {
    'afrobeat': { primary: '#FF6B35', secondary: '#F7B801', accent: '#06D6A0', name: 'Afrobeat Warmth' },
    'reggaeton': { primary: '#E63946', secondary: '#F1C40F', accent: '#2ECC71', name: 'Latin Fire' },
    'hip hop': { primary: '#9B59B6', secondary: '#3498DB', accent: '#E74C3C', name: 'Urban Pulse' },
    'rap': { primary: '#34495E', secondary: '#E67E22', accent: '#ECF0F1', name: 'Street Poetry' },
    'r&b': { primary: '#8E44AD', secondary: '#E91E63', accent: '#FFC107', name: 'Soulful Velvet' },
    'pop': { primary: '#FF6B9D', secondary: '#4ECDC4', accent: '#FFE66D', name: 'Pop Energy' },
    'rock': { primary: '#C0392B', secondary: '#95A5A6', accent: '#F39C12', name: 'Rock Edge' },
    'electronic': { primary: '#00D9FF', secondary: '#FF00FF', accent: '#00FF9F', name: 'Digital Dreams' },
    'default': { primary: '#FF6B35', secondary: '#F7B801', accent: '#06D6A0', name: 'Musical Journey' }
  };
  
  const genre = musicData.topGenre?.toLowerCase() || 'default';
  const paletteKey = Object.keys(genrePalettes).find(key => genre.includes(key)) || 'default';
  const palette = genrePalettes[paletteKey];
  
  const dominantEmotion = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0][0];
  
  return {
    emotions: scores,
    palette: palette,
    intensity: Math.min(100, Math.floor(musicData.minutesListened / 300)),
    diversity: musicData.genreCount || 20,
    dominantEmotion: dominantEmotion,
    mountainHeights: generateMountainHeights(scores, dominantEmotion),
    starPositions: generateStarPositions(scores)
  };
}

// Generate mountain heights based on emotions
function generateMountainHeights(emotions, dominant) {
  const heights = [];
  const emotionList = Object.entries(emotions).sort((a, b) => b[1] - a[1]);
  
  for (let i = 0; i < 5; i++) {
    const [emotion, score] = emotionList[i] || [dominant, 5];
    heights.push({
      emotion: emotion,
      height: 150 + (score * 30),
      width: 100 + (score * 10)
    });
  }
  
  return heights;
}

// Generate star positions based on emotional intensity
function generateStarPositions(emotions) {
  const positions = [];
  const totalEmotions = Object.values(emotions).reduce((a, b) => a + b, 0);
  const starCount = Math.min(50, Math.max(15, Math.floor(totalEmotions / 2)));
  
  for (let i = 0; i < starCount; i++) {
    positions.push({
      x: Math.random() * 800,
      y: Math.random() * 250,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.3,
      delay: Math.random() * 3
    });
  }
  
  return positions;
}

function parseAnalysis(text) {
  const sections = {
    lyrical: '',
    emotional: '',
    stress: '',
    identity: '',
    future: ''
  };

  const lines = text.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const upperLine = line.toUpperCase();
    
    if (upperLine.includes('LYRICAL LANDSCAPE') || upperLine.includes('PAYSAGE LYRIQUE') || upperLine.includes('PAISAJE LÍRICO')) {
      currentSection = 'lyrical';
      continue;
    } else if (upperLine.includes('EMOTIONAL OPERATING') || upperLine.includes('SYSTÈME ÉMOTIONNEL') || upperLine.includes('SISTEMA EMOCIONAL')) {
      currentSection = 'emotional';
      continue;
    } else if (upperLine.includes('STRESS SIGNATURE') || upperLine.includes('SIGNATURE DE STRESS') || upperLine.includes('FIRMA DE ESTRÉS')) {
      currentSection = 'stress';
      continue;
    } else if (upperLine.includes('IDENTITY ANCHOR') || upperLine.includes('ANCRES IDENTITAIRES') || upperLine.includes('ANCLAS DE IDENTIDAD')) {
      currentSection = 'identity';
      continue;
    } else if (upperLine.includes('FUTURE SELF') || upperLine.includes('SOI FUTUR') || upperLine.includes('YO FUTURO')) {
      currentSection = 'future';
      continue;
    }
    
    if (currentSection && line.trim() && !line.match(/^#+/) && !upperLine.includes('SECTION')) {
      sections[currentSection] += line.trim() + ' ';
    }
  }

  // Clean up
  Object.keys(sections).forEach(key => {
    sections[key] = sections[key].trim();
  });

  return sections;
}
