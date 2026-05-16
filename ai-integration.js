/**
 * AI INTEGRATION MODULE
 * Natural language allocation using external AI (Copilot/Gemini)
 * Handles prompt generation and response parsing
 */

const aiIntegration = {
    
    /**
     * Prepare data context for AI
     */
    getContext() {
        const stats = app.getStats();
        const workload = app.getWorkloadData();
        const unassigned = app.state.assignments.filter((a, idx) => 
            !a.educator && !app.state.allocations.get(idx)
        );

        return {
            summary: `Total slots: ${stats.totalSlots}, Assigned: ${stats.assigned}, Unassigned: ${stats.unassigned}`,
            teachers: app.state.teachers.map(t => ({
                name: t.name,
                grade: t.registerClass,
                isZulu: t.is_zulu
            })),
            workload: workload.map(w => `${w.name}: ${w.hours}h (${w.slots} slots)`).join('\n'),
            unassignedSlots: unassigned.slice(0, 10).map(a => 
                `${a.exam} - Grade ${a.grade}, ${a.timeshift}h, needs Zulu: ${a.is_zulu}`
            ).join('\n')
        };
    },

    /**
     * Build prompt for AI
     */
    buildPrompt(userRequest) {
        const context = this.getContext();

        return `You are an exam scheduling expert. You have the following data:

CURRENT STATE:
${context.summary}

TEACHERS:
${context.teachers.map(t => `- ${t.name} (Grade ${t.grade}, Zulu: ${t.isZulu})`).join('\n')}

CURRENT WORKLOAD:
${context.workload}

UNASSIGNED EXAMS (sample):
${context.unassignedSlots}

USER REQUEST: "${userRequest}"

TASK:
1. Analyze the allocation scenario
2. Provide specific recommendations for the ${context.summary.split('Unassigned: ')[1].split(',')[0]} unassigned slots
3. For each recommendation, explain:
   - Which teacher to assign
   - Why (grade match, workload balance, expertise)
   - Any concerns or constraints
4. Suggest any manual adjustments to improve balance

Format your response as:
RECOMMENDATIONS:
[numbered list of specific assignments]

REASONING:
[explain the overall strategy]

CONCERNS:
[any issues to watch]

NEXT STEPS:
[what to do if some slots remain unassigned]`;
    },

    /**
     * Submit prompt to AI
     */
    async submitPrompt(userRequest) {
        const responseDiv = document.getElementById('ai-response');
        responseDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Waiting for AI response...</p>';

        try {
            // Try to use Copilot (via window.navigator API if available)
            // Otherwise, prepare data for manual submission
            
            const prompt = this.buildPrompt(userRequest);
            
            // Check if we can access Copilot API
            if (typeof navigator.copilot !== 'undefined') {
                await this.submitToCopilot(prompt, responseDiv);
            } else if (typeof navigator.ai !== 'undefined') {
                await this.submitToGemini(prompt, responseDiv);
            } else {
                this.showCopyablePrompt(prompt, responseDiv);
            }

        } catch (error) {
            responseDiv.innerHTML = `<div class="reason-box error">
                <strong>Error:</strong> ${error.message}<br>
                <p style="font-size:0.9rem;margin-top:1rem;">
                    Copy the prompt below and paste in your preferred AI tool (ChatGPT, Copilot, Gemini)
                </p>
            </div>`;
            this.showCopyablePrompt(this.buildPrompt(userRequest), responseDiv);
        }
    },

    /**
     * Attempt Copilot submission
     */
    async submitToCopilot(prompt, responseDiv) {
        try {
            // This is a conceptual example - actual implementation depends on Copilot API availability
            const response = await fetch('/api/copilot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (response.ok) {
                const data = await response.json();
                this.displayAIResponse(data.response, responseDiv);
            } else {
                throw new Error('Copilot API unavailable');
            }
        } catch (error) {
            throw new Error('Could not connect to Copilot: ' + error.message);
        }
    },

    /**
     * Display AI response with formatting
     */
    displayAIResponse(response, responseDiv) {
        let html = '<div style="background:#f8fafc;border:1px solid var(--border);border-radius:0.75rem;padding:1.5rem;">';

        // Parse response sections
        const sections = response.split(/\n(?=\w+:)/);
        
        sections.forEach(section => {
            if (section.trim().startsWith('RECOMMENDATIONS:')) {
                html += `<div style="margin-bottom:1.5rem;">
                    <h5 style="color:var(--primary);margin-bottom:1rem;">✓ AI Recommendations</h5>
                    <div style="background:white;padding:1rem;border-radius:0.5rem;border-left:4px solid var(--success);">
                        ${section.replace(/RECOMMENDATIONS:\n/i, '').split('\n').filter(l => l.trim()).map(l => 
                            `<div style="margin:0.5rem 0;padding:0.5rem;border-bottom:1px solid var(--light-bg);">${l.trim()}</div>`
                        ).join('')}
                    </div>
                </div>`;
            } else if (section.trim().startsWith('REASONING:')) {
                html += `<div style="margin-bottom:1.5rem;">
                    <h5 style="color:var(--primary);margin-bottom:1rem;">💡 Reasoning</h5>
                    <div style="background:#fffacd;padding:1rem;border-radius:0.5rem;border-left:4px solid var(--warning);">
                        ${section.replace(/REASONING:\n/i, '').trim().replace(/\n/g, '<br>')}
                    </div>
                </div>`;
            } else if (section.trim().startsWith('CONCERNS:')) {
                html += `<div style="margin-bottom:1.5rem;">
                    <h5 style="color:var(--primary);margin-bottom:1rem;">⚠ Concerns</h5>
                    <div style="background:#fee2e2;padding:1rem;border-radius:0.5rem;border-left:4px solid var(--danger);">
                        ${section.replace(/CONCERNS:\n/i, '').trim().replace(/\n/g, '<br>')}
                    </div>
                </div>`;
            }
        });

        html += `<div style="margin-top:1.5rem;display:flex;gap:1rem;">
            <button class="btn btn-primary" onclick="aiIntegration.applyAIRecommendations()">
                <i class="fas fa-check"></i> Apply Recommendations
            </button>
            <button class="btn btn-outline" onclick="document.getElementById('ai-response').innerHTML=''">Dismiss</button>
        </div>`;

        html += '</div>';
        responseDiv.innerHTML = html;
    },

    /**
     * Show copyable prompt for manual AI submission
     */
    showCopyablePrompt(prompt, responseDiv) {
        responseDiv.innerHTML = `
            <div style="background:#f0f9ff;border:1px solid var(--accent);border-radius:0.75rem;padding:1.5rem;">
                <h5 style="color:var(--primary);margin-bottom:1rem;">📋 Copy Prompt Below</h5>
                <p style="font-size:0.9rem;color:#666;margin-bottom:1rem;">
                    1. Copy the prompt below<br>
                    2. Paste into ChatGPT, Copilot, or Gemini<br>
                    3. Get AI recommendations for your allocation
                </p>
                <div style="background:white;border:1px solid var(--border);border-radius:0.5rem;padding:1rem;margin-bottom:1rem;max-height:300px;overflow-y:auto;font-family:monospace;font-size:0.85rem;">
                    ${prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                </div>
                <button class="btn btn-primary" onclick="aiIntegration.copyPrompt('${prompt.replace(/'/g, "\\'")}')">
                    <i class="fas fa-copy"></i> Copy Prompt
                </button>
                <p style="font-size:0.85rem;color:#666;margin-top:1rem;">
                    💡 Tip: Use this same prompt format for consistent results across different AI tools
                </p>
            </div>
        `;
    },

    /**
     * Copy prompt to clipboard
     */
    copyPrompt(text) {
        navigator.clipboard.writeText(text).then(() => {
            showMessage('Prompt copied to clipboard', 'success');
        });
    },

    /**
     * Apply AI recommendations (placeholder - requires manual parsing)
     */
    applyAIRecommendations() {
        showMessage('Please manually review and apply recommendations from AI response', 'info');
        // In a full implementation, this would parse the AI response and auto-apply allocations
    }
};

/**
 * UI Functions
 */

function submitAIRequest() {
    const prompt = document.getElementById('ai-prompt').value.trim();
    if (!prompt) {
        showMessage('Enter your allocation request', 'warning');
        return;
    }

    aiIntegration.submitPrompt(prompt);
}

function clearAIPanel() {
    document.getElementById('ai-prompt').value = '';
    document.getElementById('ai-response').innerHTML = '';
}

// Export for global use
window.aiIntegration = aiIntegration;
