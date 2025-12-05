// api/analyze.js
// Vercel Serverless Function for RESONA analysis

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

    // Get API key from environment variable
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!ANTHROPIC_API_KEY) {
      console.error('Missing ANTHROPIC_API_KEY environment variable');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Build the analysis prompt
    const languageInstruction = {
      en: "Respond in English",
      es: "Responde en Español",
      fr: "Répondez en Français"
    }[language || 'en'];

    const prompt = `You are a behavioral psychologist and musical analyst working for RESONA. Analyze this person's Spotify Wrapped data and provide deep psychological insights. ${languageInstruction}.

DATA:
- Top Artists: ${artists.join(', ')}
- Top Songs: ${songs.join(', ')}
- Top Genre: ${topGenre}
- Total Minutes: ${minutesListened}
- Genre Diversity: ${genreCount || 'Not specified'} genres
- Special Day: ${specialDay || 'None provided'}

Provide insights in these exact categories. Start each section with the exact header in ALL CAPS:

1. LYRICAL LANDSCAPE
Analyze the emotional themes in their music choices. What emotional territories are they exploring? Freedom vs. connection? Past vs. future? Joy vs. melancholy? Give specific insights about their listening patterns. Be profound and personal.

2. EMOTIONAL OPERATING SYSTEM
How do they use music psychologically? For mood regulation? Emotional scaffolding? Identity reinforcement? Describe their unique pattern using behavioral psychology concepts.

3. STRESS SIGNATURE
What's their go-to coping mechanism revealed through music? What does their top artist/genre reveal about how they handle stress? Use concepts like attachment theory, self-determination theory, temporal self-orientation.

4. IDENTITY ANCHORS  
What are they holding onto vs. what are they reaching for? What do their musical choices say about their current life transition or emotional state? Be specific and insightful.

5. FUTURE SELF
Based on their patterns, what recommendations can you give? What might they explore next? How can they use music more intentionally for growth? Give actionable wisdom.

IMPORTANT: Be profound, specific, and personal. Use the actual data points (artist names, genre, etc). Make them feel SEEN. This should feel like therapy through data. Write in a warm, insightful tone - like a wise friend who truly understands them. Write 2-3 solid paragraphs for each section.`;

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
        max_tokens: 4000,
        messages: [
          { 
            role: "user", 
            content: prompt 
          }
        ],
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API Error:', errorData);
      return res.status(500).json({ 
        error: 'Analysis failed', 
        details: 'Could not connect to AI service' 
      });
    }

    const result = await response.json();
    const analysisText = result.content[0].text;

    // Parse the response into sections
    const sections = parseAnalysis(analysisText);

    return res.status(200).json({
      success: true,
      analysis: sections
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ 
      error: 'Analysis failed', 
      details: error.message 
    });
  }
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
    
    // Add content to current section (skip headers and empty lines)
    if (currentSection && line.trim() && !line.match(/^#+/) && !upperLine.includes('SECTION')) {
      sections[currentSection] += line.trim() + ' ';
    }
  }

  // Clean up sections
  Object.keys(sections).forEach(key => {
    sections[key] = sections[key].trim();
  });

  return sections;
}
