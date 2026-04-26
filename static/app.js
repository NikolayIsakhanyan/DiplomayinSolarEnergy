const API = '';

setInterval(() => {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('en-GB');
}, 1000);

function toggleBattery() {
  const cb = document.getElementById('bat-toggle');
  const fields = document.getElementById('battery-fields');
  if (cb.checked) {
    fields.classList.add('visible');
  } else {
    fields.classList.remove('visible');
  }
}

const uploadZone = document.getElementById('upload-zone');
const fileInput  = document.getElementById('json-file');

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleJsonFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleJsonFile(fileInput.files[0]);
});

function handleJsonFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      applyJsonData(data);
      document.getElementById('upload-filename').style.display = 'block';
      document.getElementById('upload-filename').textContent = '✓ Loaded: ' + file.name;
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function applyJsonData(data) {
  if (data.day_tariff   !== undefined) document.getElementById('day-tariff').value    = data.day_tariff;
  if (data.night_tariff !== undefined) document.getElementById('night-tariff').value  = data.night_tariff;
  if (data.sell_price   !== undefined) document.getElementById('sell-price').value    = data.sell_price;
  if (data.load)  document.getElementById('load').value  = data.load.join(',');
  if (data.solar) document.getElementById('solar').value = data.solar.join(',');

  const cb = document.getElementById('bat-toggle');
  const fields = document.getElementById('battery-fields');

  if (data.battery) {
    cb.checked = true;
    fields.classList.add('visible');
    const b = data.battery;
    if (b.capacity           !== undefined) document.getElementById('bat-capacity').value = b.capacity;
    if (b.initial_soc        !== undefined) document.getElementById('bat-initial').value  = b.initial_soc;
    if (b.charge_efficiency  !== undefined) document.getElementById('bat-eta-ch').value   = b.charge_efficiency;
    if (b.discharge_efficiency !== undefined) document.getElementById('bat-eta-dis').value = b.discharge_efficiency;
    if (b.degradation_cost   !== undefined) document.getElementById('bat-deg').value      = b.degradation_cost;
  } else {
    cb.checked = false;
    fields.classList.remove('visible');
  }
}

function parseList(id) {
  return document.getElementById(id).value.split(',').map(v => parseFloat(v.trim()));
}

function buildBody() {
  const load  = parseList('load');
  const solar = parseList('solar');
  const body = {
    day_tariff:   parseFloat(document.getElementById('day-tariff').value),
    night_tariff: parseFloat(document.getElementById('night-tariff').value),
    sell_price:   parseFloat(document.getElementById('sell-price').value),
    load, solar
  };

  if (document.getElementById('bat-toggle').checked) {
    body.battery = {
      capacity:              parseFloat(document.getElementById('bat-capacity').value),
      initial_soc:           parseFloat(document.getElementById('bat-initial').value),
      charge_efficiency:     parseFloat(document.getElementById('bat-eta-ch').value),
      discharge_efficiency:  parseFloat(document.getElementById('bat-eta-dis').value),
      degradation_cost:      parseFloat(document.getElementById('bat-deg').value),
    };
  }
  return body;
}

async function runOptimizer() {
  const btn = document.getElementById('run-btn');
  const msg = document.getElementById('status-msg');

  const body = buildBody();

  if (body.load.length !== 24 || body.solar.length !== 24) {
    msg.className = 'status-msg error';
    msg.textContent = '✗ Load and Solar arrays must each have exactly 24 values.';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Solving…';
  msg.className = 'status-msg';
  document.getElementById('solver-status').textContent = 'SOLVING…';

  try {
    const res = await fetch(`${API}/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const d = await res.json();

    updateKPIs(d);
    updateResults(d);
    renderChart(d.hours, d.has_battery);
    renderTable(d.hours, d.has_battery);
    if (d.has_battery) renderSOC(d.hours, body.battery.capacity);

    msg.className = 'status-msg ok';
    msg.textContent = `✓ Optimal solution found at ${new Date().toLocaleTimeString()}`;
    document.getElementById('solver-status').textContent = 'OPTIMAL';

  } catch (e) {
    msg.className = 'status-msg error';
    msg.textContent = `✗ ${e.message} — is the FastAPI server running on port 8000?`;
    document.getElementById('solver-status').textContent = 'ERROR';
  }

  btn.disabled = false;
  btn.textContent = '⚡ Run LP Optimizer';
}

function updateKPIs(d) {
  document.getElementById('kpi-solar').textContent  = d.total_solar + ' kWh';
  document.getElementById('kpi-bought').textContent = d.total_bought + ' kWh';
  document.getElementById('kpi-sold').textContent   = d.total_sold + ' kWh';
  document.getElementById('kpi-savings-pct').textContent = d.savings_pct + '%';

  const batCard = document.getElementById('kpi-bat-card');
  if (d.has_battery) {
    batCard.style.opacity = '1';
    document.getElementById('kpi-discharged').textContent = (d.total_discharged ?? '—') + ' kWh';
  } else {
    batCard.style.opacity = '0.35';
    document.getElementById('kpi-discharged').textContent = '— kWh';
  }
}

function updateResults(d) {
  document.getElementById('r-status').textContent    = d.status;
  document.getElementById('r-status').style.color    = d.status === 'Optimal' ? 'var(--sell)' : 'var(--sun)';
  document.getElementById('r-baseline').textContent  = d.baseline_cost.toLocaleString() + ' AMD';
  document.getElementById('r-optimized').textContent = d.optimized_cost.toLocaleString() + ' AMD';
  document.getElementById('r-savings').textContent   = '+' + d.savings.toLocaleString() + ' AMD';
  document.getElementById('r-revenue').textContent   = d.sell_revenue.toLocaleString() + ' AMD';
  document.getElementById('r-pct').textContent       = d.savings_pct + '%';

  const batRow  = document.getElementById('r-bat-row');
  const batcRow = document.getElementById('r-batc-row');
  const socCard = document.getElementById('bat-soc-card');

  if (d.has_battery) {
    batRow.style.display  = 'flex';
    batcRow.style.display = 'flex';
    socCard.style.display = 'block';
    document.getElementById('r-discharged').textContent = (d.total_discharged ?? '—') + ' kWh';
    document.getElementById('r-charged').textContent    = (d.total_charged ?? '—') + ' kWh';
    document.getElementById('leg-bat').style.display = 'flex';
    document.getElementById('leg-ch').style.display  = 'flex';
  } else {
    batRow.style.display  = 'none';
    batcRow.style.display = 'none';
    socCard.style.display = 'none';
    document.getElementById('leg-bat').style.display = 'none';
    document.getElementById('leg-ch').style.display  = 'none';
  }
}

function renderChart(hours, hasBat) {
  const maxVal = Math.max(...hours.map(h => Math.max(
    h.buy, h.sell, h.solar,
    hasBat ? (h.discharge || 0) : 0,
    hasBat ? (h.charge    || 0) : 0,
    0.1
  )));

  const container = document.getElementById('chart-bars');
  const labelsEl  = document.getElementById('hour-labels');
  container.innerHTML = '';
  labelsEl.innerHTML  = '';

  hours.forEach(h => {
    const col = document.createElement('div');
    col.className = 'bar-col';

    let tipHTML = `<b>${h.hour}:00</b><br>Buy: ${h.buy} kWh<br>Sell: ${h.sell} kWh<br>Solar: ${h.solar} kWh`;
    if (hasBat) tipHTML += `<br>Discharge: ${h.discharge||0} kWh<br>Charge: ${h.charge||0} kWh<br>SOC: ${h.soc||0} kWh`;

    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.innerHTML = tipHTML;
    col.appendChild(tip);

    const segs = [
      { val: h.solar,              color: 'rgba(255,184,48,0.75)' },
      { val: h.sell,               color: 'rgba(105,255,71,0.75)' },
      { val: h.buy,                color: 'rgba(0,229,255,0.75)'  },
      ...(hasBat ? [
        { val: h.discharge || 0,   color: 'rgba(191,138,255,0.75)' },
        { val: h.charge    || 0,   color: 'rgba(255,107,219,0.6)'  },
      ] : []),
    ];

    segs.forEach(s => {
      if (s.val > 0) {
        const bar = document.createElement('div');
        bar.className = 'bar-segment';
        bar.style.background = s.color;
        bar.style.height = Math.round((s.val / maxVal) * 145) + 'px';
        col.appendChild(bar);
      }
    });

    container.appendChild(col);

    const lbl = document.createElement('div');
    lbl.className = 'hour-lbl';
    lbl.textContent = h.hour % 3 === 0 ? h.hour : '';
    labelsEl.appendChild(lbl);
  });
}

function renderSOC(hours, capacity) {
  const socs = hours.map(h => h.soc || 0);
  const finalSoc = socs[socs.length - 1];
  const pct = capacity > 0 ? (finalSoc / capacity * 100).toFixed(1) : 0;

  document.getElementById('soc-final-val').textContent = finalSoc + ' kWh (' + pct + '%)';
  document.getElementById('soc-bar').style.width = pct + '%';
  document.getElementById('soc-cap-label').textContent = capacity + ' kWh max';

  const svg = document.getElementById('soc-svg');
  const W = svg.clientWidth || 400;
  const H = 80;
  const pad = 4;
  const maxSoc = capacity;

  const pts = socs.map((v, i) => {
    const x = pad + (i / (socs.length - 1)) * (W - pad * 2);
    const y = H - pad - (v / maxSoc) * (H - pad * 2);
    return [x, y];
  });

  const polyline = pts.map(p => p.join(',')).join(' ');
  const areaClose = `${pts[pts.length-1][0]},${H - pad} ${pts[0][0]},${H - pad}`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="rgba(191,138,255,0.35)"/>
        <stop offset="100%" stop-color="rgba(191,138,255,0)"/>
      </linearGradient>
    </defs>
    <polygon points="${polyline} ${areaClose}" fill="url(#socGrad)"/>
    <polyline points="${polyline}" fill="none" stroke="var(--battery)" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((p, i) => i % 6 === 0 ? `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--battery)"/>` : '').join('')}
  `;

  const labelsEl = document.getElementById('soc-hour-labels');
  labelsEl.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const lbl = document.createElement('div');
    lbl.className = 'hour-lbl';
    lbl.textContent = i % 3 === 0 ? i : '';
    labelsEl.appendChild(lbl);
  }
}

function renderTable(hours, hasBat) {
  const head = document.getElementById('table-head');
  const extraCols = hasBat
    ? '<th>Charge (kWh)</th><th>Discharge (kWh)</th><th>SOC (kWh)</th>'
    : '';

  head.innerHTML = `<tr>
    <th>Hour</th><th>Period</th><th>Load (kWh)</th><th>Solar (kWh)</th>
    <th>Buy (kWh)</th><th>Sell (kWh)</th><th>Tariff</th>${extraCols}
  </tr>`;

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = hours.map(h => {
    const batCols = hasBat
      ? `<td class="td-charge">${h.charge||0}</td><td class="td-dis">${h.discharge||0}</td><td class="td-soc">${h.soc||0}</td>`
      : '';
    return `<tr>
      <td>${String(h.hour).padStart(2,'0')}:00</td>
      <td class="${h.period==='Night'?'td-night':''}">${h.period}</td>
      <td>${h.load}</td>
      <td class="td-solar">${h.solar}</td>
      <td class="td-buy">${h.buy}</td>
      <td class="td-sell">${h.sell}</td>
      <td style="color:var(--muted)">${h.tariff}</td>
      ${batCols}
    </tr>`;
  }).join('');
}

window.addEventListener('load', () => {});
