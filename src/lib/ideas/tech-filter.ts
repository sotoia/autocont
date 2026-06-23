/**
 * Filtro de relevancia tech.
 *
 * Pre-filtra items antes de gastar Claude en ellos. Acepta cualquier item
 * cuyo título o descripción contenga al menos una keyword de la allowlist
 * (en español o inglés).
 *
 * Diseñado para ser permisivo con los falsos positivos (mejor procesar de
 * más que perder un buen ítem). Si tras varios polls aparecen recurrentes
 * temas no-tech que se cuelan, ampliamos la blocklist.
 */

const TECH_KEYWORDS = [
  // IA / ML core
  "ai", "ia", " a.i", "machine learning", "ml", "deep learning",
  "neural network", "neural networks", "red neuronal", "redes neuronales",
  "llm", "llms", "large language model", "modelo de lenguaje",
  "transformer", "diffusion", "generative",
  "gpt", "chatgpt", "claude", "anthropic", "openai", "deepmind",
  "gemini", "copilot", "cursor", "perplexity", "mistral", "llama",
  "agi", "agente", "agent", "agentic", "agentico", "prompt",
  "midjourney", "dall-e", "sora", "runway", "stable diffusion",
  "ia generativa", "generative ai", "arxiv", "paper",

  // Programación / dev
  "programación", "programar", "programador", "code", "coding", "código",
  "developer", "dev ", " dev,", "software", "framework", "library",
  "api", "sdk", "github", "gitlab", "git ", "open source", "código abierto",
  "python", "javascript", "typescript", "rust", "golang", "java ",
  "react", "vue", "next.js", "nextjs", "node.js", "nodejs", "django",

  // Tech general
  "tech", "tecnología", "tecnologia", "tecnológico", "tecnologico",
  "startup", "internet", "computer", "computadora", "ordenador",
  "hardware", "cpu", "gpu", "chip", "semiconductor", "kernel",
  "linux", "macos", "windows", "ios", "android",
  "apple", "google", "microsoft", "meta", "amazon", "nvidia",
  "tesla", "spacex", "x.com", "twitter", "telegram", "whatsapp",
  "smartphone", "móvil", "iphone", "ipad", "macbook", "samsung",
  "huawei", "xiaomi",

  // Web / cloud
  "web3", "blockchain", "crypto", "bitcoin", "ethereum", "nft",
  "cloud", "aws", "azure", "vercel", "supabase", "firebase",
  "saas", "paas",

  // Robótica / autonomía / hardware avanzado
  "robot", "robotic", "robótica", "robotica", "drone", "dron",
  "automation", "automatización", "automatizacion",
  "vehículo autónomo", "autonomous vehicle", "self-driving",
  "vr", "ar", "virtual reality", "realidad virtual", "augmented reality",
  "metaverso", "neuralink", "brain-computer",

  // Ciberseguridad
  "ciberseguridad", "cybersecurity", "cyber attack", "ciberataque",
  "hacker", "hacking", "vulnerabilidad", "vulnerability",
  "exploit", "ransomware", "phishing", "malware", "encryption",
  "encriptación", "0day", "zero day", "cve",

  // Datos / privacidad / regulación tech
  "big data", "data science", "data scientist", "científico de datos",
  "privacidad", "privacy", "gdpr", "rgpd", "ai act",

  // Audio / vision / NLP
  "nlp", "computer vision", "visión por computador", "ocr",
  "asr", "tts", "voz sintética", "voice ai", "speech ",

  // Otros tech-adjacent
  "iot", "5g", "6g", "satellite", "starlink", "fiber",
  "raspberry pi", "arduino", "esp32", "fpga",

  // Ecosistema IA específico
  "huggingface", "hugging face", "kaggle", "colab", "jupyter",
  "pytorch", "tensorflow", "jax", "langchain", "vector database",
  "embedding", "embeddings", "rag", "fine-tun", "finetun",
];

// Términos que casi siempre indican política / no-tech. Si aparecen y no
// hay ninguna keyword tech, descartamos sin necesidad de heurística extra.
// (No usamos esto como blocklist hard porque "Microsoft compra X" es tech
//  aunque mencione un país/político.)
const STRONGLY_NON_TECH = [
  "elecciones", "election", "presidenciales", "diputados", "senado",
  "guerra de", "war in", "ucrania", "ukraine", "rusia", "russia",
  "putin", "trump", "biden", "harris", "feijóo", "feijoo", "sánchez", "sanchez",
  "real madrid", "barça", "barca", "champions league", "fútbol", "futbol",
  "messi", "cristiano ronaldo", "lakers", "nba", "nfl",
  "celebridades", "famosos", "kardashian", "taylor swift",
];

export interface TechClassification {
  isTech: boolean;
  matchedKeywords: string[];
}

/**
 * Determina si un item es relevante para tech/IA/programación.
 * Usa **word boundaries** para evitar falsos positivos como "ai" matcheando
 * "Ukraine" o "ar" matcheando "Berserkers". Cada keyword se busca como
 * palabra completa (rodeada por espacio, puntuación o inicio/fin de cadena).
 *
 * Las keywords multi-palabra se buscan como frase ("machine learning",
 * "deep learning"). Single-word keywords usan \b.
 */
export function classifyTech(text: string): TechClassification {
  const haystack = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, ""); // strip diacritics

  const matched: string[] = [];
  for (const kw of TECH_KEYWORDS) {
    const k = kw.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
    if (!k) continue;

    let hit = false;
    if (k.includes(" ")) {
      // Frase exacta — ya tiene su propio contexto
      hit = haystack.includes(k);
    } else {
      // Palabra suelta — exigimos word boundary para evitar substring matches.
      // Construimos regex escapando los caracteres especiales (.[] etc).
      const escaped = k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
      hit = re.test(haystack);
    }
    if (hit) {
      matched.push(kw);
      if (matched.length >= 3) break;
    }
  }

  if (matched.length > 0) {
    return { isTech: true, matchedKeywords: matched };
  }
  return { isTech: false, matchedKeywords: [] };
}

export function looksStronglyNonTech(text: string): boolean {
  const haystack = text.toLowerCase();
  return STRONGLY_NON_TECH.some((t) => haystack.includes(t));
}

/**
 * Fuentes 100% IA: solo publican IA/ML, casi imposible que metan otra cosa.
 * Para estas saltamos el filtro keyword. El resto debe pasar el classifier.
 *
 * NO incluimos aquí blogs/sites generalistas (Ars Technica, MIT Tech Review,
 * Wired, Lex Fridman) aunque tengan reputación tech, porque también publican
 * política, ciencia, entrevistas no-tech, gaming, lifestyle, etc.
 */
const TECH_ONLY_SOURCES = new Set([
  "Anthropic Blog",
  "OpenAI Blog",
  "DeepMind Blog",
  "VentureBeat AI",
  "Dot CSV",
  "Xavier Mitjana",
  "Romualdo",
  "Jon Hernández IA",
  "LógicamenteAclarado",
  "Juan Pe Navarro IA",
  "Alejavi Rivera",
  "Two Minute Papers",
  "AI Explained",
  "Matt Wolfe",
  "MattVidPro AI",
  "The AI Advantage",
  "WesRoth",
  "bycloud",
]);

export function isTechOnlySource(name: string): boolean {
  return TECH_ONLY_SOURCES.has(name);
}
