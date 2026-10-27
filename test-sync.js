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

            if (typeof autoSortShiftsArray === 'function') {
                autoSortShiftsArray(window.shifts);
            }

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
