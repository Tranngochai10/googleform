const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));


// In-memory job state
let currentJob = {
  active: false,
  total: 0,
  completed: 0,
  success: 0,
  failed: 0,
  logs: []
};

// Extract form structure from Google Form view URL
async function parseGoogleForm(formUrl) {
  // Normalize URL to /viewform
  let targetUrl = formUrl.trim();
  if (!targetUrl.includes('/viewform') && targetUrl.includes('/formResponse')) {
    targetUrl = targetUrl.replace('/formResponse', '/viewform');
  } else if (!targetUrl.endsWith('/viewform') && !targetUrl.includes('?')) {
    targetUrl = targetUrl.replace(/\/$/, '') + '/viewform';
  }

  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google Form: HTTP status ${response.status}`);
  }

  const html = await response.text();

  // Find FB_PUBLIC_LOAD_DATA_
  const match = html.match(/var FB_PUBLIC_LOAD_DATA_ = (.*?);<\/script>/);
  if (!match) {
    throw new Error("Could not extract Google Form data. Make sure it is a public Google Form URL.");
  }

  const parsed = JSON.parse(match[1]);
  const formTitle = parsed[3] || "Google Form";
  const rawQuestions = parsed[1][1] || [];

  let pageCount = 1; // Base is page 0
  const questions = [];
  
  rawQuestions.forEach((q) => {
    const qId = q[0];
    const qTitle = q[1];
    const qType = q[3];
    const entryList = q[4];

    // Type 8 is Page Break in Google Forms
    if (qType === 8) {
      pageCount++;
    }

    if (entryList && entryList.length > 0) {
      entryList.forEach((entry) => {
        const entryId = entry[0];
        const choices = entry[1] ? entry[1].map(c => c[0]) : null;
        
        questions.push({
          id: qId,
          entryId: `entry.${entryId}`,
          title: qTitle,
          type: qType,
          choices: choices
        });
      });
    }
  });

  // Calculate page history string (e.g. "0,1,2")
  const pageHistory = Array.from({ length: pageCount }, (_, i) => i).join(',');

  // Action URL
  const formIdMatch = targetUrl.match(/\/forms\/d\/e\/([^/]+)/);
  if (!formIdMatch) {
    throw new Error("Invalid Google Form URL format.");
  }
  const formResponseUrl = `https://docs.google.com/forms/d/e/${formIdMatch[1]}/formResponse`;

  return {
    title: formTitle,
    actionUrl: formResponseUrl,
    pageHistory: pageHistory,
    questions: questions
  };
}

// Endpoint to analyze form URL
app.get('/api/analyze', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const formInfo = await parseGoogleForm(url);
    res.json(formInfo);
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to check current submit status
app.get('/api/status', (req, res) => {
  res.json(currentJob);
});

// Stop current submission
app.post('/api/stop', (req, res) => {
  if (currentJob.active) {
    currentJob.active = false;
    currentJob.logs.unshift({ timestamp: new Date().toLocaleTimeString(), message: "Submission stopped by user." });
  }
  res.json({ success: true });
});

// Endpoint to submit
app.post('/api/submit', async (req, res) => {
  const { actionUrl, count, questionsConfig, pageHistory } = req.body;

  if (!actionUrl || !count || !questionsConfig) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  if (currentJob.active) {
    return res.status(400).json({ error: "Another submit job is already running." });
  }

  // Initialize job
  currentJob = {
    active: true,
    total: parseInt(count) || 100,
    completed: 0,
    success: 0,
    failed: 0,
    logs: [{ timestamp: new Date().toLocaleTimeString(), message: `Starting auto-submitter for ${count} iterations...` }]
  };

  res.json({ success: true, message: "Started job successfully" });

  // Run async loop
  (async () => {
    for (let i = 0; i < currentJob.total; i++) {
      if (!currentJob.active) break;

      try {
        const bodyParams = new URLSearchParams();
        
        // Add metadata
        bodyParams.append('fvv', '1');
        bodyParams.append('pageHistory', pageHistory || '0');

        // Populate randomly according to distributions
        for (const config of questionsConfig) {
          const { entryId, type, choices, mode, fixedValue, weights } = config;
          
          let selectedValue = "";

          if (mode === 'fixed') {
            selectedValue = fixedValue || "";
            bodyParams.append(entryId, selectedValue);
          } else if (mode === 'random') {
            if (choices && choices.length > 0) {
              // Custom weights if available
              if (weights && Object.keys(weights).length > 0) {
                const choicesList = Object.keys(weights);
                const weightList = choicesList.map(c => parseFloat(weights[c]) || 0);
                const totalWeight = weightList.reduce((a, b) => a + b, 0);
                
                let randomVal = Math.random() * totalWeight;
                for (let idx = 0; idx < choicesList.length; idx++) {
                  if (randomVal < weightList[idx]) {
                    selectedValue = choicesList[idx];
                    break;
                  }
                  randomVal -= weightList[idx];
                }
              } else {
                // Uniform random
                const randIndex = Math.floor(Math.random() * choices.length);
                selectedValue = choices[randIndex];
              }
              bodyParams.append(entryId, selectedValue);
            } else {
              // Standard scale or open text (just randomize numbers 1-6 if no choices)
              selectedValue = String(Math.floor(Math.random() * 6) + 1);
              bodyParams.append(entryId, selectedValue);
            }
          }
        }


        // Send POST request
        const res = await fetch(actionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          body: bodyParams.toString()
        });

        if (res.ok) {
          currentJob.success++;
        } else {
          currentJob.failed++;
          currentJob.logs.unshift({
            timestamp: new Date().toLocaleTimeString(),
            message: `[Warning] Iteration ${i + 1} received status ${res.status}`
          });
        }
      } catch (err) {
        currentJob.failed++;
        currentJob.logs.unshift({
          timestamp: new Date().toLocaleTimeString(),
          message: `[Error] Iteration ${i + 1} failed: ${err.message}`
        });
      }

      currentJob.completed++;
      
      // Real-time status logging every 10 runs
      if (currentJob.completed % 10 === 0 || currentJob.completed === currentJob.total) {
        currentJob.logs.unshift({
          timestamp: new Date().toLocaleTimeString(),
          message: `Progress: ${currentJob.completed}/${currentJob.total} (Success: ${currentJob.success}, Failed: ${currentJob.failed})`
        });
      }

      // Add small delay to prevent blocking or rate limits (between 400ms and 1000ms)
      const randomDelay = Math.floor(Math.random() * 600) + 400;
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    }

    currentJob.active = false;
    currentJob.logs.unshift({
      timestamp: new Date().toLocaleTimeString(),
      message: `Completed form submission. Total runs: ${currentJob.completed}. Successes: ${currentJob.success}, Failures: ${currentJob.failed}.`
    });
  })();
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
