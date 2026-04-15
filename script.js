let chartConsumInstance = null;
let chartCostInstance = null;
let missingFields = []; 
let is3YearsMode = false;

let appData = { baseElec: 0, baseWater: 0, basePaperMoney: 0, baseCleanMoney: 0 };
let scalesMax = { elec: 100, water: 100, euros: 100 };

const multipliers = {
    elec:   {1:0.7, 2:1.4, 3:1.1, 4:0.7, 5:1.1, 6:0.6, 7:0.5, 8:0.5, 9:1.1, 10:1.1, 11:1.1, 12:0.6},
    water:  {1:0.6, 2:0.9, 3:1.0, 4:0.6, 5:1.4, 6:1.4, 7:0.4, 8:0.4, 9:1.3, 10:1.0, 11:0.9, 12:0.5},
    paper:  {1:0.6, 2:1.2, 3:1.2, 4:0.7, 5:1.2, 6:1.2, 7:0.2, 8:0.0, 9:1.2, 10:1.2, 11:1.2, 12:0.5},
    clean:  {1:0.6, 2:1.1, 3:1.1, 4:0.7, 5:1.1, 6:1.1, 7:0.5, 8:0.0, 9:1.1, 10:1.1, 11:1.1, 12:0.5}
};
const schoolMonths = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
const monthNames = ['Gen', 'Feb', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Des'];

document.querySelectorAll('.action-cb').forEach(cb => { cb.addEventListener('change', calculate); });

function toggleAllActions() {
    if(is3YearsMode) return; 
    const checkboxes = document.querySelectorAll('.action-cb');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
    calculate();
}

function toggle3YearsMode() {
    is3YearsMode = !is3YearsMode;
    const btn = document.getElementById('btn3Years');
    const grid = document.getElementById('tipsGrid');
    const btnAll = document.getElementById('btnSelectAll');
    const subtitle = document.getElementById('tipsSubtitle');
    const thElements = document.querySelectorAll('th');

    if (is3YearsMode) {
        btn.innerText = 'Tornar al Mode 1 Any';
        btn.style.backgroundColor = '#d32f2f'; 
        grid.style.opacity = '0.4';
        grid.style.pointerEvents = 'none';
        btnAll.style.display = 'none';
        subtitle.innerHTML = "<strong style='color:#1976d2;'>Simulació Automàtica Activa:</strong> Les mesures s'apliquen progressivament cada any (10% Any 1, 20% Any 2, 30% Any 3).";
        
        document.getElementById('tableTitle').innerText = '1. Resultats del Càlcul (Any 3 - Final)';
        document.getElementById('thYear').innerText = 'Consum Final (Any 3)';
        document.getElementById('thSchool').innerText = 'Període Lectiu (Any 3)';
        thElements.forEach(th => th.style.backgroundColor = '#1976d2'); 
    } else {
        btn.innerText = 'Representar cronograma';
        btn.style.backgroundColor = '#1976d2';
        grid.style.opacity = '1';
        grid.style.pointerEvents = 'auto';
        btnAll.style.display = 'inline-block';
        subtitle.innerText = "Selecciona manualment o utilitza 'Representar cronograma' per simular.";
        
        document.getElementById('tableTitle').innerText = '1. Resultats del Càlcul (1 Any)';
        document.getElementById('thYear').innerText = 'Pròxim Any (12 mesos)';
        document.getElementById('thSchool').innerText = 'Període Lectiu (Set-Juny)';
        thElements.forEach(th => th.style.backgroundColor = 'var(--primary-color)');
    }
    calculate();
}

document.getElementById('fallbackFileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const jsonData = JSON.parse(e.target.result);
            parseJsonData(jsonData);
            document.getElementById("alertBox").style.display = "none";
            updateDisplayParams();
            computeMaxScales();
            calculate();
        } catch (err) { alert("Error de format a l'arxiu JSON."); }
    };
    reader.readAsText(file);
});

window.onload = async function() {
    try {
        const response = await fetch('dataclean.json');
        if (!response.ok) throw new Error('No es pot accedir');
        const jsonData = await response.json();
        parseJsonData(jsonData);
        updateDisplayParams();
        computeMaxScales();
        calculate();
    } catch (error) {
        document.getElementById("alertBox").style.display = "block";
        document.getElementById('base-params-display').innerHTML = "<span style='color:#c62828'>Esperant la càrrega de dades...</span>";
        calculate(); 
    }
};

function parseJsonData(data) {
    appData = { baseElec: 0, baseWater: 0, basePaperMoney: 0, baseCleanMoney: 0 };
    missingFields = [];

    const energyKey = Object.keys(data).find(k => k.toLowerCase().includes('energy') || (data[k] && data[k].total_consumption_kwh !== undefined));
    if (energyKey && data[energyKey].total_consumption_kwh) appData.baseElec = data[energyKey].total_consumption_kwh;
    else missingFields.push("Electricitat");

    const waterKey = Object.keys(data).find(k => k.toLowerCase().includes('water'));
    if (waterKey && Array.isArray(data[waterKey]) && data[waterKey].length > 0) {
        let totalDaily = data[waterKey].reduce((sum, item) => sum + (item.daily_consumption_m3 || 0), 0);
        appData.baseWater = (totalDaily / data[waterKey].length) * 30;
    } else missingFields.push("Aigua");

    const officeKey = Object.keys(data).find(k => k.toLowerCase().includes('office'));
    if (officeKey && Array.isArray(data[officeKey]) && data[officeKey].length > 0) {
        let totalAmount = data[officeKey].reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
        appData.basePaperMoney = totalAmount / data[officeKey].length; 
    } else missingFields.push("Consumibles");

    let cleanData = null;
    if (data.invoices) {
        const cleanKeyInvoices = Object.keys(data.invoices).find(k => k.toLowerCase().includes('clean'));
        if (cleanKeyInvoices) cleanData = data.invoices[cleanKeyInvoices];
    }
    if (!cleanData) {
        const cleanKeyRoot = Object.keys(data).find(k => k.toLowerCase().includes('clean'));
        if (cleanKeyRoot) cleanData = data[cleanKeyRoot];
    }
    if (cleanData && Array.isArray(cleanData) && cleanData.length > 0) {
        let totalAmount = cleanData.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
        appData.baseCleanMoney = totalAmount / cleanData.length;
    } else missingFields.push("Neteja");
}

function computeMaxScales() {
    let mE = 0, mW = 0, mC = 0;
    for (let month = 1; month <= 12; month++) {
        let e = appData.baseElec * multipliers.elec[month];
        let w = appData.baseWater * multipliers.water[month];
        let p = appData.basePaperMoney * multipliers.paper[month];
        let c = appData.baseCleanMoney * multipliers.clean[month];
        if (e > mE) mE = e;
        if (w > mW) mW = w;
        if (p > mC) mC = p;
        if (c > mC) mC = c;
    }
    scalesMax.elec = mE > 0 ? Math.ceil(mE * 1.1) : 100;
    scalesMax.water = mW > 0 ? Math.ceil(mW * 1.1) : 100;
    scalesMax.euros = mC > 0 ? Math.ceil(mC * 1.1) : 100;
}

function updateDisplayParams() {
    document.getElementById('base-params-display').innerHTML = `
        <strong>Bases:</strong> Elec: ${appData.baseElec.toFixed(2)}kWh | Aigua: ${appData.baseWater.toFixed(2)}m³ | Ofic: ${appData.basePaperMoney.toFixed(2)}€ | Net: ${appData.baseCleanMoney.toFixed(2)}€
    `;
    const headerAlert = document.getElementById("missingDataHeaderAlert");
    if (missingFields.length > 0) {
        headerAlert.innerHTML = `⚠️ <strong>Dades no trobades al JSON:</strong> ${missingFields.join(', ')}. S'han marcat a 0.`;
        headerAlert.style.display = "block";
    } else {
        headerAlert.style.display = "none";
    }
}

function formatCellResult(originalValue, factor, unit) {
    // Formata amb un màxim de 2 decimals
    const origStr = originalValue.toLocaleString('ca-ES', {maximumFractionDigits: 2});
    
    // Si hi ha descompte (factor < 1), s'aplica L'EFECTE DE DESCOMPTE (text ratllat + nou valor) independentment del mode.
    if (factor < 1.0 && originalValue > 0) {
        const reducedStr = (originalValue * factor).toLocaleString('ca-ES', {maximumFractionDigits: 2});
        return `<del style="color: #c62828; font-size:0.9em; margin-right:5px;">${origStr}</del> <strong>${reducedStr}</strong> ${unit}`;
    }
    return `${origStr} ${unit}`;
}

function calculate() {
    let dataElec = [], dataWater = [], dataPaper = [], dataClean = [];
    let plotLabels = [];
    
    let base_elec_year = 0, base_elec_school = 0;
    let base_water_year = 0, base_water_school = 0;
    let base_paper_year = 0, base_paper_school = 0;
    let base_clean_year = 0, base_clean_school = 0;

    let finalFactorElec = 1.0, finalFactorWater = 1.0, finalFactorPaper = 1.0, finalFactorClean = 1.0;

    if (!is3YearsMode) {
        let redElec = 0, redWater = 0, redPaper = 0, redClean = 0;
        document.querySelectorAll('.action-cb:checked').forEach(cb => {
            const cat = cb.getAttribute('data-category');
            const val = parseFloat(cb.getAttribute('data-reduction'));
            if(cat === 'elec') redElec += val;
            if(cat === 'water') redWater += val;
            if(cat === 'paper') redPaper += val;
            if(cat === 'clean') redClean += val;
        });

        finalFactorElec = 1.0 - redElec;
        finalFactorWater = 1.0 - redWater;
        finalFactorPaper = 1.0 - redPaper;
        finalFactorClean = 1.0 - redClean;

        for (let month = 1; month <= 12; month++) {
            plotLabels.push(monthNames[month-1]);
            let elec_month_orig = appData.baseElec * multipliers.elec[month];
            let water_month_orig = appData.baseWater * multipliers.water[month];
            let paper_month_money_orig = appData.basePaperMoney * multipliers.paper[month];
            let clean_month_money_orig = appData.baseCleanMoney * multipliers.clean[month];

            dataElec.push(elec_month_orig * finalFactorElec);
            dataWater.push(water_month_orig * finalFactorWater);
            dataPaper.push(paper_month_money_orig * finalFactorPaper);
            dataClean.push(clean_month_money_orig * finalFactorClean);

            base_elec_year += elec_month_orig; base_water_year += water_month_orig;
            base_paper_year += paper_month_money_orig; base_clean_year += clean_month_money_orig;

            if (schoolMonths.includes(month)) {
                base_elec_school += elec_month_orig; base_water_school += water_month_orig;
                base_paper_school += paper_month_money_orig; base_clean_school += clean_month_money_orig;
            }
        }
    } else {
        const factorsByYear = [
            { e: 0.90, w: 0.90, p: 0.90, c: 0.90 }, 
            { e: 0.80, w: 0.80, p: 0.80, c: 0.80 }, 
            { e: 0.70, w: 0.70, p: 0.70, c: 0.70 }  
        ];

        finalFactorElec = factorsByYear[2].e;
        finalFactorWater = factorsByYear[2].w;
        finalFactorPaper = factorsByYear[2].p;
        finalFactorClean = factorsByYear[2].c;

        for(let year = 0; year < 3; year++) {
            let fE = factorsByYear[year].e;
            let fW = factorsByYear[year].w;
            let fP = factorsByYear[year].p;
            let fC = factorsByYear[year].c;

            for (let month = 1; month <= 12; month++) {
                plotLabels.push(`${monthNames[month-1]} (A${year+1})`);
                let elec_month_orig = appData.baseElec * multipliers.elec[month];
                let water_month_orig = appData.baseWater * multipliers.water[month];
                let paper_month_money_orig = appData.basePaperMoney * multipliers.paper[month];
                let clean_month_money_orig = appData.baseCleanMoney * multipliers.clean[month];

                dataElec.push(elec_month_orig * fE);
                dataWater.push(water_month_orig * fW);
                dataPaper.push(paper_month_money_orig * fP);
                dataClean.push(clean_month_money_orig * fC);

                if(year === 2) {
                    base_elec_year += elec_month_orig; base_water_year += water_month_orig;
                    base_paper_year += paper_month_money_orig; base_clean_year += clean_month_money_orig;

                    if (schoolMonths.includes(month)) {
                        base_elec_school += elec_month_orig; base_water_school += water_month_orig;
                        base_paper_school += paper_month_money_orig; base_clean_school += clean_month_money_orig;
                    }
                }
            }
        }
    }

    const tbody = document.getElementById("resultsTable");
    tbody.innerHTML = `
        <tr><td><strong>⚡ Electricitat</strong></td><td>${formatCellResult(base_elec_year, finalFactorElec, 'kWh')}</td><td>${formatCellResult(base_elec_school, finalFactorElec, 'kWh')}</td></tr>
        <tr><td><strong>💧 Aigua</strong></td><td>${formatCellResult(base_water_year, finalFactorWater, 'm³')}</td><td>${formatCellResult(base_water_school, finalFactorWater, 'm³')}</td></tr>
        <tr><td><strong>📄 Consumibles</strong></td><td>${formatCellResult(base_paper_year, finalFactorPaper, '€')}</td><td>${formatCellResult(base_paper_school, finalFactorPaper, '€')}</td></tr>
        <tr><td><strong>🧹 Neteja</strong></td><td>${formatCellResult(base_clean_year, finalFactorClean, '€')}</td><td>${formatCellResult(base_clean_school, finalFactorClean, '€')}</td></tr>
    `;

    renderCharts(dataElec, dataWater, dataPaper, dataClean, plotLabels);
}

function renderCharts(dElec, dWater, dPaper, dClean, labels) {
    
    const ctxConsum = document.getElementById('chartConsum').getContext('2d');
    if (chartConsumInstance) chartConsumInstance.destroy();

    chartConsumInstance = new Chart(ctxConsum, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Electr. (kWh)', data: dElec, borderColor: '#fbc02d', backgroundColor: '#fbc02d', yAxisID: 'y1', tension: 0.3, borderWidth: 2, pointRadius: is3YearsMode ? 0 : 2 },
                { label: 'Aigua (m³)', data: dWater, borderColor: '#0288d1', backgroundColor: '#0288d1', yAxisID: 'y', tension: 0.3, borderWidth: 2, pointRadius: is3YearsMode ? 0 : 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: {size: 10} } },
                title: { display: true, text: 'Consums Físics', font: {size: 11}, padding: {top: 0, bottom: 5} },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            // Obliga la gràfica a mostrar 2 decimals
                            if (context.parsed.y !== null) { label += context.parsed.y.toFixed(2); }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { font: {size: 9}, maxTicksLimit: 12 } }, 
                y: { type: 'linear', position: 'left', min: 0, max: scalesMax.water, ticks: { font: {size: 9} } },
                y1: { type: 'linear', position: 'right', min: 0, max: scalesMax.elec, grid: { drawOnChartArea: false }, ticks: { font: {size: 9} } }
            }
        }
    });

    const ctxCost = document.getElementById('chartCost').getContext('2d');
    if (chartCostInstance) chartCostInstance.destroy();

    chartCostInstance = new Chart(ctxCost, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Ofimàtica (€)', data: dPaper, borderColor: '#7b1fa2', backgroundColor: '#7b1fa2', tension: 0.3, borderWidth: 2, pointRadius: is3YearsMode ? 0 : 2 },
                { label: 'Neteja (€)', data: dClean, borderColor: '#388e3c', backgroundColor: '#388e3c', tension: 0.3, borderWidth: 2, pointRadius: is3YearsMode ? 0 : 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: {size: 10} } },
                title: { display: true, text: 'Despeses Econòmiques (€)', font: {size: 11}, padding: {top: 0, bottom: 5} },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            // Obliga la gràfica a mostrar 2 decimals
                            if (context.parsed.y !== null) { label += context.parsed.y.toFixed(2); }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { font: {size: 9}, maxTicksLimit: 12 } },
                y: { type: 'linear', position: 'left', min: 0, max: scalesMax.euros, ticks: { font: {size: 9} } }
            }
        }
    });
}