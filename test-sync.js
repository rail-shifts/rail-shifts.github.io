// =========================================================================
// test-sync.js - כלי סנכרון חד-כיווני בלעדי לסביבת הבדיקות (Test Environment)
// קובץ זה לא ימוזג לעולם ל-main (מוגן בכללי הפרויקט).
// =========================================================================

(function initTestSyncModule() {
    const isTestEnvironment = window.location.hostname.includes('vercel.app') || window.location.hostname === 'localhost';
    if (!isTestEnvironment) {
        console.log('[TestSync] Not running in test environment. Module deactivated.');
        return;
    }

    // ---------------------------------------------------------
    // Header Display Experiment (iPad Blur Diagnostic Tool)
    // ---------------------------------------------------------
    const EXP_STORAGE_KEY = 'railway_header_experiment';

    function applyExperimentStyle(exp) {
        let st = document.getElementById('headerExperimentStyle');
        if (!st) {
            st = document.createElement('style');
            st.id = 'headerExperimentStyle';
            document.head.appendChild(st);
        }
        if (exp === 'sticky') {
            st.textContent = 'header{position:-webkit-sticky!important;position:sticky!important;top:0!important;}.app-container{padding-top:6px!important;}';
        } else if (exp === 'top1px') {
            st.textContent = 'header{top:1px!important;}.app-container{padding-top:calc(49px + env(safe-area-inset-top, 0px))!important;}';
        } else if (exp === 'hardware') {
            st.textContent = 'header{-webkit-transform:translateZ(0)!important;transform:translateZ(0)!important;will-change:transform!important;}';
        } else if (exp === 'relative') {
            st.textContent = 'header{position:relative!important;top:auto!important;}.app-container{padding-top:6px!important;}';
        } else {
            st.textContent = '';
        }
    }

    // Apply currently active experiment on module startup
    applyExperimentStyle(localStorage.getItem(EXP_STORAGE_KEY) || 'default');

    const STORAGE_KEY = 'railway_test_sync_enabled';

    function isSyncEnabled() {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    }

    function setSyncEnabled(enabled) {
        localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    }

    // Pull shifts from cloud into local shifts non-destructively
    async function pullCloudShifts(isSilent = false) {
        const statusEl = document.getElementById('testSyncStatus');
        const btn = document.getElementById('btnPullCloudTest');

        const user = window.currentUser || (window.auth && window.auth.currentUser);
        const uid = user ? user.uid : localStorage.getItem('railway_last_user');

        if (!uid || !window.db || !window.collection || !window.getDocs) {
            if (!isSilent) {
                if (typeof showStatusBubbleToast === 'function') {
                    showStatusBubbleToast('יש להתחבר לחשבון Google כדי למשוך משמרות');
                }
            }
            if (statusEl) statusEl.textContent = 'נדרשת התחברות לחשבון Google';
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'מושך נתונים מהענן...';
        }
        if (statusEl) statusEl.textContent = 'טוען נתונים מהענן...';

        try {
            const shiftsRef = window.collection(window.db, 'users', uid, 'shifts');
            const snapshot = await window.getDocs(shiftsRef);
            const cloudShifts = [];
            snapshot.forEach(docSnap => {
                cloudShifts.push(docSnap.data());
            });

            if (cloudShifts.length === 0) {
                if (statusEl) statusEl.textContent = 'לא נמצאו משמרות שמורות בענן';
                if (!isSilent && typeof showStatusBubbleToast === 'function') {
                    showStatusBubbleToast('לא נמצאו משמרות בענן עבור משתמש זה');
                }
                return;
            }

            // Read current local shifts
            let localShifts = JSON.parse(localStorage.getItem('railway_shifts') || '[]');
            if (!Array.isArray(window.shifts)) {
                window.shifts = localShifts;
            }

            const existingIds = new Set(window.shifts.map(s => String(s.id)));
            let addedCount = 0;

            for (const cs of cloudShifts) {
                if (!cs || !cs.id) continue;
                if (!existingIds.has(String(cs.id))) {
                    window.shifts.push(cs);
                    existingIds.add(String(cs.id));
                    addedCount++;
                }
            }

            window.shifts.sort((a, b) => {
                const dateA = a.date || '';
                const dateB = b.date || '';
                if (dateA !== dateB) return dateB.localeCompare(dateA);
                const timeA = a.startTime || '00:00';
                const timeB = b.startTime || '00:00';
                return timeB.localeCompare(timeA);
            });

            localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));

            if (typeof renderShifts === 'function') renderShifts();
            if (typeof updateActiveShiftUI === 'function') updateActiveShiftUI();
            if (typeof updateMonthlySummary === 'function') updateMonthlySummary();
            if (typeof updateMonthStatsBadge === 'function') updateMonthStatsBadge();

            const msg = `נמשכו ${cloudShifts.length} משמרות (נוספו ${addedCount} חדשות)`;
            if (statusEl) statusEl.textContent = msg;
            if (!isSilent && typeof showStatusBubbleToast === 'function') {
                showStatusBubbleToast(msg);
            }
        } catch (err) {
            console.error('[TestSync] Error pulling cloud shifts:', err);
            if (statusEl) statusEl.textContent = 'שגיאה במשיכת נתונים: ' + (err.message || 'שגיאת רשת');
            if (!isSilent && typeof showStatusBubbleToast === 'function') {
                showStatusBubbleToast('שגיאה במשיכת נתונים מהענן');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'משוך משמרות מהענן עכשיו';
            }
        }
    }

    // Expose globally for Test environment
    window.pullCloudShiftsForTest = pullCloudShifts;

    // Inject UI into settings modal
    function injectSettingsUI() {
        if (document.getElementById('testSyncCard')) return;

        const settingsModal = document.getElementById('settingsModal');
        if (!settingsModal) return;

        const contentContainer = settingsModal.querySelector('.modal-sheet > div:last-child');
        if (!contentContainer) return;

        const card = document.createElement('div');
        card.id = 'testSyncCard';
        card.className = 'card-sub-section';
        card.style.cssText = 'padding: 14px; border: 1px dashed rgba(0, 210, 255, 0.45); background: rgba(0, 210, 255, 0.05); border-radius: 12px; margin-top: 6px; box-sizing: border-box;';

        const enabled = isSyncEnabled();

        card.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div style="text-align: right;">
                    <div style="font-weight: 800; font-size: 0.92rem; color: var(--accent-cyan); display: flex; align-items: center; gap: 6px;">
                        <span>🧪 סנכרון ענן (טסטר בלבד)</span>
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 3px;">
                        משיכה חד-כיוונית ללא כתיבה לענן (Append)
                    </div>
                </div>
                <label style="position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; cursor: pointer;">
                    <input type="checkbox" id="testSyncToggle" ${enabled ? 'checked' : ''} style="opacity: 0; width: 0; height: 0; position: absolute;">
                    <span id="testSyncSlider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${enabled ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.2)'}; transition: 0.25s; border-radius: 24px;">
                        <span id="testSyncThumb" style="position: absolute; content: ''; height: 18px; width: 18px; left: ${enabled ? '22px' : '3px'}; bottom: 3px; background-color: white; transition: 0.25s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.4);"></span>
                    </span>
                </label>
            </div>
            <div id="testSyncActions" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                <button id="btnPullCloudTest" type="button" style="width: 100%; padding: 9px; background: rgba(0, 136, 255, 0.25); border: 1px solid var(--accent-blue); color: #ffffff; border-radius: 10px; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;">
                    משוך משמרות מהענן עכשיו
                </button>
                <div id="testSyncStatus" style="font-size: 0.76rem; color: var(--text-muted); text-align: center; min-height: 14px;"></div>
            </div>
        `;

        contentContainer.appendChild(card);

        // Header Display Experiment Card
        const expCard = document.createElement('div');
        expCard.id = 'headerExpCard';
        expCard.className = 'card-sub-section';
        expCard.style.cssText = 'padding: 14px; border: 1px dashed rgba(255, 170, 0, 0.45); background: rgba(255, 170, 0, 0.05); border-radius: 12px; margin-top: 10px; box-sizing: border-box;';

        const currentExp = localStorage.getItem(EXP_STORAGE_KEY) || 'default';

        expCard.innerHTML = `
            <div style="text-align: right; margin-bottom: 8px;">
                <div style="font-weight: 800; font-size: 0.92rem; color: #ffaa00; display: flex; align-items: center; gap: 6px;">
                    <span>🔬 ניסוי תצוגת הדר (iPad Blur Fix)</span>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 3px;">
                    בחר מצב, סגור את האפליקציה לגמרי באייפד ופתח מחדש לבדיקה
                </div>
            </div>
            <select id="headerExpSelect" style="width: 100%; padding: 9px 12px; background: rgba(11, 19, 41, 0.9); border: 1px solid rgba(255, 170, 0, 0.5); border-radius: 10px; color: #ffffff; font-size: 0.88rem; outline: none; cursor: pointer; box-sizing: border-box;">
                <option value="default" ${currentExp === 'default' ? 'selected' : ''}>1. רגיל (Fixed - המצב הנוכחי)</option>
                <option value="sticky" ${currentExp === 'sticky' ? 'selected' : ''}>2. Sticky (דביק בתזרים הדף)</option>
                <option value="top1px" ${currentExp === 'top1px' ? 'selected' : ''}>3. Fixed + רווח 1px מלמעלה</option>
                <option value="hardware" ${currentExp === 'hardware' ? 'selected' : ''}>4. האצת חומרה (Transform 3D)</option>
                <option value="relative" ${currentExp === 'relative' ? 'selected' : ''}>5. גלילה רגילה (Relative - לא נעוץ)</option>
            </select>
            <div id="headerExpStatus" style="font-size: 0.75rem; color: #00d2ff; text-align: center; margin-top: 8px; min-height: 14px;"></div>
        `;

        contentContainer.appendChild(expCard);

        const expSelect = document.getElementById('headerExpSelect');
        const expStatus = document.getElementById('headerExpStatus');

        if (expSelect) {
            expSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                localStorage.setItem(EXP_STORAGE_KEY, val);
                applyExperimentStyle(val);
                if (expStatus) {
                    expStatus.textContent = '✓ המצב עודכן! סגור את האפליקציה מה-App Switcher ופתח מחדש לבדיקת פתיחה קרה';
                }
                if (typeof showStatusBubbleToast === 'function') {
                    showStatusBubbleToast('מצב הדר עודכן');
                }
            });
        }

        const toggle = document.getElementById('testSyncToggle');
        const slider = document.getElementById('testSyncSlider');
        const thumb = document.getElementById('testSyncThumb');
        const pullBtn = document.getElementById('btnPullCloudTest');

        if (toggle) {
            toggle.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                setSyncEnabled(isChecked);
                if (slider) slider.style.backgroundColor = isChecked ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.2)';
                if (thumb) thumb.style.left = isChecked ? '22px' : '3px';

                if (isChecked) {
                    pullCloudShifts(false);
                } else {
                    const statusEl = document.getElementById('testSyncStatus');
                    if (statusEl) statusEl.textContent = 'סנכרון ענן כבוי – עובד במצב מקומי מבודד';
                    if (typeof showStatusBubbleToast === 'function') {
                        showStatusBubbleToast('סנכרון ענן כבוי בטסטר');
                    }
                }
            });
        }

        if (pullBtn) {
            pullBtn.addEventListener('click', () => {
                pullCloudShifts(false);
            });
        }
    }

    // Listen for settings modal open
    const origOpenSettingsModal = window.openSettingsModal;
    window.openSettingsModal = function() {
        if (typeof origOpenSettingsModal === 'function') {
            origOpenSettingsModal();
        }
        injectSettingsUI();
    };

    // Auto-run if enabled upon authentication
    let hasAutoSynced = false;
    function checkAndAutoSync() {
        if (hasAutoSynced || !isSyncEnabled()) return;
        const uid = (window.currentUser && window.currentUser.uid) || (window.auth && window.auth.currentUser && window.auth.currentUser.uid);
        if (uid && window.db && window.collection && window.getDocs) {
            hasAutoSynced = true;
            console.log('[TestSync] Auto-pulling cloud shifts for test environment...');
            pullCloudShifts(true);
        }
    }

    // Check periodically during initial 5 seconds for auth readiness
    const interval = setInterval(() => {
        if (hasAutoSynced) {
            clearInterval(interval);
            return;
        }
        checkAndAutoSync();
    }, 500);
    setTimeout(() => clearInterval(interval), 6000);

    console.log('[TestSync] Test sync module loaded successfully (enabled: ' + isSyncEnabled() + ')');
})();
