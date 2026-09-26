// Connexion SSE
const eventSource = new EventSource('/events');

eventSource.onmessage = (event) => {
    try {
        const state = JSON.parse(event.data);
        updateDashboard(state);
    } catch (e) {
        console.error('Erreur parsing SSE:', e);
    }
};

function updateDashboard(state) {
    // 1. Colonne Gemini
    const geminiGrid = document.getElementById('gemini-grid');
    if (geminiGrid) {
        geminiGrid.innerHTML = '';
        if (state.workers && state.workers.length > 0) {
            state.workers.forEach(w => {
                const card = document.createElement('div');
                card.className = `worker-card gemini ${w.status === 'fait' ? 'done' : ''}`;
                
                // Barre d'activité pour l'état en-cours
                const activityBar = w.status === 'en-cours' ? '<div class="activity-bar"></div>' : '';
                
                const actionsHTML = w.actions && w.actions.length > 0 
                    ? `<ul>${w.actions.map(a => `<li>${a}</li>`).join('')}</ul>`
                    : '<p>Aucune action récente</p>';
                
                card.innerHTML = `<h3>${w.title}</h3>
                                  <div class="lot-meta">
                                      <span class="status ${w.status}">${w.status}</span>
                                      <span class="duration">${w.duration}</span>
                                  </div>
                                  ${activityBar}
                                  <div class="actions">${actionsHTML}</div>`;
                geminiGrid.appendChild(card);
            });
        } else {
            geminiGrid.innerHTML = '<p>Aucun lot Gemini en cours.</p>';
        }
    }

    // 2. Colonne Claude
    const claudeGrid = document.getElementById('claude-grid');
    if (claudeGrid) {
        claudeGrid.innerHTML = '';
        if (state.claude && state.claude.length > 0) {
            state.claude.forEach(c => {
                const card = document.createElement('div');
                card.className = `worker-card claude ${c.status === 'fait' ? 'done' : ''}`;
                
                const activityBar = c.status === 'en-cours' ? '<div class="activity-bar"></div>' : '';

                card.innerHTML = `<h3>${c.title}</h3>
                                  <div class="lot-meta">
                                      <span class="status ${c.status}">${c.status}</span>
                                      <span class="duration">${c.duration}</span>
                                  </div>
                                  ${activityBar}
                                  <div class="details"><p>${c.details || 'Travail en cours...'}</p></div>`;
                claudeGrid.appendChild(card);
            });
        } else {
            claudeGrid.innerHTML = '<p>Aucun agent Claude actif.</p>';
        }
    }

    // 3. Colonne Gradium / Générations
    const gradiumGrid = document.getElementById('gradium-grid');
    if (gradiumGrid) {
        gradiumGrid.innerHTML = '';
        if (state.gradium && state.gradium.length > 0) {
            state.gradium.forEach(g => {
                const item = document.createElement('div');
                item.className = `event-item`;
                const timeStr = new Date(g.t).toLocaleTimeString();
                item.innerHTML = `<span class="event-time">${timeStr}</span>
                                  <strong>${g.source}</strong>: ${g.title || g.message || 'Génération'}`;
                gradiumGrid.appendChild(item);
            });
        } else {
            gradiumGrid.innerHTML = '<p>Aucune génération récente.</p>';
        }
    }

    // 4. Résultats
    const capturesDiv = document.getElementById('latest-captures');
    if (capturesDiv) {
        capturesDiv.innerHTML = '<h3>Images & Planches</h3>';
        if (state.results && state.results.captures && state.results.captures.length > 0) {
            state.results.captures.forEach(c => {
                capturesDiv.innerHTML += `<img src="/files/${encodeURIComponent(c)}" class="capture-img" style="max-height: 200px; margin-right: 10px; margin-bottom: 10px;">`;
            });
        } else {
            capturesDiv.innerHTML += '<p>Aucune image récente.</p>';
        }
    }

    const audioDiv = document.getElementById('latest-audio');
    if (audioDiv) {
        audioDiv.innerHTML = '<h3>Dernières Voix</h3>';
        let hasAudio = false;

        if (state.results && state.results.presetAudio && state.results.presetAudio.length > 0) {
            hasAudio = true;
            state.results.presetAudio.forEach(f => {
                audioDiv.innerHTML += `<div style="margin-bottom: 10px;">
                    <small>${f.split('/').pop()}</small><br>
                    <audio controls src="/files/${encodeURIComponent(f)}" style="height: 30px;"></audio>
                </div>`;
            });
        }

        if (!hasAudio) {
            audioDiv.innerHTML += '<p>Aucun fichier audio récent.</p>';
        }
    }

    const reportsDiv = document.getElementById('latest-reports');
    if (reportsDiv) {
        reportsDiv.innerHTML = '<h3>Derniers rapports</h3>';
        if (state.results && state.results.reports && state.results.reports.length > 0) {
            state.results.reports.slice(-3).forEach(r => {
                reportsDiv.innerHTML += `<div style="background: var(--vinyle); padding: 5px; margin-bottom: 5px; border-radius: 4px;">
                    <strong><a href="/files/${r.file}" target="_blank">${r.title || r.file}</a></strong>
                    <p style="margin: 0; font-size: 0.8em;">${r.lines.join('<br>')}</p>
                </div>`;
            });
        }
    }
}

// Horloges
function updateClocks() {
    const now = new Date();
    const target = (hours) => {
        const d = new Date();
        d.setHours(hours, 0, 0, 0);
        return d;
    };
    
    const diff = (targetTime) => {
        const ms = targetTime - now;
        if (ms <= 0) return "00:00:00";
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    const time18 = document.getElementById('time-18h');
    const time19 = document.getElementById('time-19h');
    const time20 = document.getElementById('time-20h');
    
    if(time18) time18.textContent = diff(target(18));
    if(time19) time19.textContent = diff(target(19));
    if(time20) time20.textContent = diff(target(20));
}
setInterval(updateClocks, 1000);
updateClocks();
