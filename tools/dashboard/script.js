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
    // 1. Qui travaille
    const workersGrid = document.getElementById('workers-grid');
    workersGrid.innerHTML = '';
    if (state.workers && state.workers.length > 0) {
        state.workers.forEach(w => {
            const card = document.createElement('div');
            card.className = `worker-card ${w.source || 'inconnu'}`;
            const actionsHTML = w.actions && w.actions.length > 0 
                ? `<ul>${w.actions.map(a => `<li>${a.message || a.title || JSON.stringify(a)}</li>`).join('')}</ul>`
                : '<p>Aucune action récente</p>';
            card.innerHTML = `<h3>${w.model || w.source || 'Worker'}</h3>
                              <p>Dernières actions :</p>
                              ${actionsHTML}`;
            workersGrid.appendChild(card);
        });
    } else {
        workersGrid.innerHTML = '<p>Personne ne travaille en ce moment.</p>';
    }

    // 2. Le fil
    const feed = document.getElementById('feed');
    feed.innerHTML = '';
    if (state.events && state.events.length > 0) {
        state.events.forEach(e => {
            const item = document.createElement('div');
            item.className = `event-item`;
            const timeStr = e.t || e.time ? new Date(e.t || e.time).toLocaleTimeString() : new Date().toLocaleTimeString();
            item.innerHTML = `<span class="event-time">${timeStr}</span>
                              <strong>${e.source || '?'}</strong>: ${e.title || e.message || 'Événement'}`;
            feed.appendChild(item);
        });
    } else {
        feed.innerHTML = '<p>Aucun événement récent.</p>';
    }

    // 3. Les lots
    const updateLots = (id, lots) => {
        const col = document.getElementById(id);
        const title = id === 'lots-todo' ? 'À prendre' : id === 'lots-doing' ? 'En cours' : 'Fait';
        col.innerHTML = `<h3>${title}</h3>`;
        if (lots && lots.length > 0) {
            lots.forEach(l => {
                const el = document.createElement('div');
                el.className = 'lot-item';
                el.innerHTML = `<strong>[${l.id}]</strong> ${l.title}<br><small>${l.assignee || l.owner || 'Non assigné'}</small>`;
                col.appendChild(el);
            });
        }
    };
    if (state.lots) {
        updateLots('lots-todo', state.lots.todo);
        updateLots('lots-doing', state.lots.doing);
        updateLots('lots-done', state.lots.done);
    }

    // 4. Résultats
    const capturesDiv = document.getElementById('latest-captures');
    capturesDiv.innerHTML = '<h3>Dernières captures</h3>';
    if (state.results && state.results.captures && state.results.captures.length > 0) {
        state.results.captures.forEach(c => {
            capturesDiv.innerHTML += `<img src="/files/${encodeURIComponent(c)}" class="capture-img" style="max-height: 200px; margin-right: 10px; margin-bottom: 10px;">`;
        });
    } else {
        capturesDiv.innerHTML += '<p>Aucune capture récente.</p>';
    }

    const scoresDiv = document.getElementById('latest-scores');
    scoresDiv.innerHTML = '<h3>Scores</h3>';
    if (state.results && state.results.anim) {
        scoresDiv.innerHTML += `<p>Animation : <strong>${state.results.anim.score !== undefined ? state.results.anim.score : '?'}</strong> / 100</p>`;
    }
    if (state.results && state.results.balance) {
        scoresDiv.innerHTML += `<p>Équilibrage : ${JSON.stringify(state.results.balance)}</p>`;
    }

    const audioDiv = document.getElementById('latest-audio');
    audioDiv.innerHTML = '<h3>Dernières Voix</h3>';
    if (state.results && state.results.voices && state.results.voices.files) {
        const files = Object.keys(state.results.voices.files).slice(-3); // Prend les 3 dernières
        files.forEach(f => {
            audioDiv.innerHTML += `<div><small>${f}</small><br><audio controls src="/files/public/assets/voices/${f}"></audio></div>`;
        });
    }

    const reportsDiv = document.getElementById('latest-reports');
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
