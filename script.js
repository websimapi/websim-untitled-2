import { marked } from 'marked';
import DOMPurify from 'dompurify';

const WEBSIM_URL_REGEX = /https?:\/\/(?:www\.)?websim\.(?:com|ai|co)\/(?:p|project|s|c)\/[a-zA-Z0-9-]+(?:\/\d+)?/i;
const PROJECT_URL_REGEX = /https?:\/\/(?:www\.)?websim\.(?:com|ai|co)\/p\/([a-zA-Z0-9_-]{20,})/i;
const SITE_URL_REGEX = /https?:\/\/(?:www\.)?websim\.(?:com|ai|co)\/s\/([a-zA-Z0-9]{17})/i;

const state = {
    projectId: null,
    currentUser: null,
    commentsCursor: null,
    userProjectsCursor: null,
    isLoading: false,
    isLoadingProjects: false,
    allCommentsLoaded: false,
    allProjectsLoaded: false,
    selectedProject: null,
    currentSearchTerm: '',
};

const elements = {
    entriesContainer: document.getElementById('entries-container'),
    loadingIndicator: document.getElementById('loading-indicator'),
    loadMoreButton: document.getElementById('load-more-button'),
    postEntryButton: document.getElementById('post-entry-button'),
    totalTipPool: document.getElementById('total-tip-pool'),
    // Modal elements
    modal: document.getElementById('submission-modal'),
    closeModalButton: document.getElementById('close-modal-button'),
    userProjectsContainer: document.getElementById('user-projects-container'),
    projectSearchInput: document.getElementById('project-search-input'),
    manualUrlInput: document.getElementById('manual-url-input'),
    modelsCheckboxes: document.getElementById('models-checkboxes'),
    featuresCheckboxes: document.getElementById('features-checkboxes'),
    prepareSubmissionButton: document.getElementById('prepare-submission-button'),
    submissionError: document.getElementById('submission-error'),
    projectLoadingIndicator: document.getElementById('project-loading-indicator'),
    examplesGrid: document.getElementById('examples-grid'),
};

const constants = {
    EXAMPLE_PROJECTS: [
        { id: "XW11yBfS6KAZx2a59Y_K", title: "WebClone", description: "A clone of the Websim UI.", url: "https://webclone.on.websim.com", slug: "webclone" },
        { id: "vD-2kK4nQ5kZlA1NFPqj", title: "DOOM Title", description: "A recreation of the classic DOOM title screen.", url: "https://doom-title.on.websim.com", slug: "doom-title" },
        { id: "k7nQyKAdD9lZ4N0j5B2V", title: "Club Duckling", description: "An interactive social menu experience.", url: "https://club-duckling.on.websim.com", slug: "club-duckling" },
        { id: "M0nJkL9dD4lZ4N0j5B2V", title: "Webscape", description: "A nostalgic, interactive desktop UI.", url: "https://webscape.on.websim.com", slug: "webscape" },
    ],
    MODELS: {
        "Free": ["Kimi K2", "Gemini Flash 2.5 Thinking"],
        "Standard": ["Gemini 2.5 Pro", "04-mini Thinking", "Sonnet 4"],
        "Premium": ["Sonnet 4 Thinking"],
    },
    FEATURES: [
        "AI Models", "Realtime Multiplayer", "Comments", "Database", 
        "Database v2.1", "Websim Metadata API", "Tweaks"
    ]
};

function sanitizeAndParseMarkdown(rawContent) {
    if (!rawContent) return '';
    const dirtyHtml = marked.parse(rawContent, { async: false });
    return DOMPurify.sanitize(dirtyHtml, { USE_PROFILES: { html: true } });
}

function createEntryCard(commentData) {
    const { author, raw_content, id } = commentData.comment;

    const card = document.createElement('div');
    card.className = 'entry-card';
    card.dataset.commentId = id;

    const header = document.createElement('div');
    header.className = 'entry-header';

    const avatar = document.createElement('img');
    avatar.src = author.avatar_url || 'logo.png';
    avatar.alt = `${author.username}'s avatar`;
    avatar.className = 'author-avatar';
    
    const name = document.createElement('span');
    name.className = 'author-name';
    name.textContent = author.username;
    
    header.appendChild(avatar);
    header.appendChild(name);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'entry-content';
    // This will render the main content, including the link.
    contentDiv.innerHTML = sanitizeAndParseMarkdown(raw_content);

    // Add sections for details if they exist
    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'entry-details';

    const modelMatch = raw_content.match(/\*\*Models Used:\*\*\n([\s\S]*?)(?=\n\n|\n\*\*|$)/);
    const featureMatch = raw_content.match(/\*\*Features Used:\*\*\n([\s\S]*)/);
    
    if(modelMatch && modelMatch[1].trim()) {
        const modelsGroup = document.createElement('div');
        modelsGroup.className = 'detail-group';
        modelsGroup.innerHTML = '<h4>Models Used</h4><ul>' + modelMatch[1].trim().split('\n').map(item => `<li>${item.substring(2)}</li>`).join('') + '</ul>';
        detailsContainer.appendChild(modelsGroup);
    }
    
    if(featureMatch && featureMatch[1].trim()) {
        const featuresGroup = document.createElement('div');
        featuresGroup.className = 'detail-group';
        featuresGroup.innerHTML = '<h4>Features Used</h4><ul>' + featureMatch[1].trim().split('\n').map(item => `<li>${item.substring(2)}</li>`).join('') + '</ul>';
        detailsContainer.appendChild(featuresGroup);
    }

    card.appendChild(header);
    card.appendChild(contentDiv);
    if(detailsContainer.children.length > 0) {
        contentDiv.appendChild(detailsContainer);
    }
    
    return card;
}

function createExampleCard(project) {
    const card = document.createElement('a');
    card.href = project.url;
    card.target = '_blank';
    card.className = 'example-card';

    // Use the slug to construct the thumbnail URL, as requested.
    const thumbnailUrl = `https://images.websim.com/v1/users/api/slugs/${project.slug}/_thumbnail`;

    card.innerHTML = `
        <img src="${thumbnailUrl}" alt="${project.title} thumbnail" class="example-thumbnail">
        <div class="example-info">
            <div class="example-title">${project.title}</div>
            <div class="example-desc">${project.description}</div>
        </div>
    `;
    return card;
}

function renderExamples() {
    constants.EXAMPLE_PROJECTS.forEach(project => {
        const card = createExampleCard(project);
        elements.examplesGrid.appendChild(card);
    });
}

function renderEntry(comment) {
    const isEntry = WEBSIM_URL_REGEX.test(comment.comment.raw_content);
    if (!isEntry) return; 
    if (document.querySelector(`.entry-card[data-comment-id="${comment.comment.id}"]`)) return;
    
    const card = createEntryCard(comment);
    elements.entriesContainer.appendChild(card); // Append to keep chronological order
}

async function fetchComments(cursor = null) {
    if (state.isLoading) return;
    state.isLoading = true;
    elements.loadingIndicator.classList.remove('hidden');
    elements.loadMoreButton.classList.add('hidden');

    try {
        const params = new URLSearchParams();
        if (cursor) params.append('after', cursor);
        params.append('first', 10);

        const response = await fetch(`/api/v1/projects/${state.projectId}/comments?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const { comments } = await response.json();
        
        comments.data.forEach(renderEntry);
        
        state.commentsCursor = comments.meta.end_cursor;
        if (!comments.meta.has_next_page) {
            state.allCommentsLoaded = true;
            elements.loadingIndicator.classList.add('hidden');
        } else {
             elements.loadMoreButton.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Failed to fetch comments:", error);
    } finally {
        state.isLoading = false;
        if (!state.allCommentsLoaded) {
           elements.loadingIndicator.classList.add('hidden');
        }
    }
}

async function fetchAllTipsAndCalcPool() {
    let totalCredits = 0;
    let hasNextPage = true;
    let cursor = null;

    try {
        while(hasNextPage) {
            const params = new URLSearchParams({ only_tips: 'true', first: 100 });
            if (cursor) params.append('after', cursor);
            const response = await fetch(`/api/v1/projects/${state.projectId}/comments?${params.toString()}`);
            if (!response.ok) break; // Fail gracefully
            const { comments } = await response.json();

            comments.data.forEach(c => {
                if (c.comment.card_data && c.comment.card_data.type === 'tip_comment') {
                    totalCredits += c.comment.card_data.credits_spent;
                }
            });

            hasNextPage = comments.meta.has_next_page;
            cursor = comments.meta.end_cursor;
        }

        const poolAmount = Math.floor(totalCredits / 2);
        // Use k for thousands
        if (poolAmount >= 1000) {
            elements.totalTipPool.textContent = (poolAmount / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        } else {
            elements.totalTipPool.textContent = poolAmount.toLocaleString();
        }
    } catch (error) {
        console.error("Failed to fetch tips:", error);
        elements.totalTipPool.textContent = 'Error';
    }
}

// --- Submission Modal Logic ---

function populateCheckboxes() {
    Object.entries(constants.MODELS).forEach(([groupName, models]) => {
        const group = document.createElement('div');
        group.innerHTML = `<p><strong>${groupName}</strong></p>`;
        models.forEach(model => {
            const id = `model-${model.replace(/[^a-zA-Z0-9]/g, '')}`;
            group.innerHTML += `<div class="checkbox-item"><input type="checkbox" id="${id}" name="model" value="${model}"><label for="${id}">${model}</label></div>`;
        });
        elements.modelsCheckboxes.appendChild(group);
    });

    constants.FEATURES.forEach(feature => {
        const id = `feature-${feature.replace(/[^a-zA-Z0-9]/g, '')}`;
        elements.featuresCheckboxes.innerHTML += `<div class="checkbox-item"><input type="checkbox" id="${id}" name="feature" value="${feature}"><label for="${id}">${feature}</label></div>`;
    });
}

function validateSubmission() {
    const manualUrl = elements.manualUrlInput.value.trim();
    const isProjectSelected = !!state.selectedProject;
    const isValidUrl = WEBSIM_URL_REGEX.test(manualUrl);

    if (isProjectSelected || isValidUrl) {
        elements.prepareSubmissionButton.disabled = false;
        elements.submissionError.classList.add('hidden');
    } else {
        elements.prepareSubmissionButton.disabled = true;
    }
}

async function fetchUserProjects(cursor = null, search = '') {
    if (state.isLoadingProjects || !state.currentUser) return;
    state.isLoadingProjects = true;
    elements.projectLoadingIndicator.classList.remove('hidden');

    try {
        const params = new URLSearchParams({ first: 12, posted: true, sort_by: 'updated_at' });
        if (cursor) params.append('after', cursor);
        if (search) params.append('query', search);

        const response = await fetch(`/api/v1/users/${state.currentUser.id}/projects?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch user projects');
        const { projects } = await response.json();

        projects.data.forEach(p => renderProjectItem(p.project));
        state.userProjectsCursor = projects.meta.end_cursor;
        state.allProjectsLoaded = !projects.meta.has_next_page;

    } catch (error) {
        console.error(error);
    } finally {
        state.isLoadingProjects = false;
        elements.projectLoadingIndicator.classList.add('hidden');
    }
}

function renderProjectItem(project) {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.dataset.projectId = project.id;
    item.dataset.projectTitle = project.title;

    const thumbnailUrl = project.thumbnail?.url || `https://images.websim.com/v1/project/${project.id}/_thumbnail`;

    item.innerHTML = `
        <img src="${thumbnailUrl}" alt="${project.title} thumbnail">
        <p>${project.title || 'Untitled'}</p>
    `;
    item.addEventListener('click', () => {
        document.querySelectorAll('.project-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        state.selectedProject = project;
        elements.manualUrlInput.value = ''; // Clear manual input
        validateSubmission();
    });
    elements.userProjectsContainer.appendChild(item);
}

function openSubmissionModal() {
    elements.modal.classList.add('active');
    if (!state.userProjectsCursor && !state.isLoadingProjects) {
        fetchUserProjects(null, state.currentSearchTerm);
    }
}

function closeSubmissionModal() {
    elements.modal.classList.remove('active');
}

function handlePrepareSubmission() {
    const manualUrl = elements.manualUrlInput.value.trim();
    let projectUrl = '';
    let projectTitle = 'My Project';

    if (state.selectedProject) {
        projectUrl = `https://websim.com/p/${state.selectedProject.id}`;
        projectTitle = state.selectedProject.title || projectTitle;
    } else if (WEBSIM_URL_REGEX.test(manualUrl)) {
        projectUrl = manualUrl;
        const pMatch = manualUrl.match(PROJECT_URL_REGEX);
        const sMatch = manualUrl.match(SITE_URL_REGEX);
        if (pMatch) projectTitle = `Project ${pMatch[1].substring(0, 5)}...`;
        if (sMatch) projectTitle = `Site ${sMatch[1].substring(0, 5)}...`;
    } else {
        elements.submissionError.textContent = 'Please select a project or enter a valid Websim URL.';
        elements.submissionError.classList.remove('hidden');
        return;
    }

    const selectedModels = Array.from(elements.modelsCheckboxes.querySelectorAll('input:checked')).map(cb => `- ${cb.value}`);
    const selectedFeatures = Array.from(elements.featuresCheckboxes.querySelectorAll('input:checked')).map(cb => `- ${cb.value}`);
    
    let content = `**My Entry:** [${projectTitle}](${projectUrl})`;
    if (selectedModels.length) {
        content += `\n\n**Models Used:**\n${selectedModels.join('\n')}`;
    }
    if (selectedFeatures.length) {
        content += `\n\n**Features Used:**\n${selectedFeatures.join('\n')}`;
    }

    window.websim.postComment({ content });
    closeSubmissionModal();
}

function handleNewComment(event) {
    const { comment } = event.comment; // The event data structure is slightly different
    renderEntry({ comment, cursor: event.cursor });

    if (comment.card_data && comment.card_data.type === 'tip_comment') {
        console.log('New tip received! Recalculating prize pool.');
        fetchAllTipsAndCalcPool();
    }
}

function handleScroll() {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
        fetchComments(state.commentsCursor);
    }
}

function handlePostEntry() {
    window.websim.postComment({
        content: "Check out my project for the UI Jam! https://websim.ai/p/your-project-id",
    });
}

async function init() {
    try {
        const project = await window.websim.getCurrentProject();
        state.projectId = project.id;
        state.currentUser = await window.websim.getCurrentUser();
        
        await Promise.all([
            fetchComments(),
            fetchAllTipsAndCalcPool()
        ]);
        
        renderExamples();
        populateCheckboxes();

        elements.loadMoreButton.addEventListener('click', () => fetchComments(state.commentsCursor));
        elements.postEntryButton.addEventListener('click', openSubmissionModal);
        
        // Modal Listeners
        elements.closeModalButton.addEventListener('click', closeSubmissionModal);
        elements.modal.addEventListener('click', (e) => {
            if (e.target === elements.modal) closeSubmissionModal();
        });
        elements.prepareSubmissionButton.addEventListener('click', handlePrepareSubmission);
        [elements.manualUrlInput, ...elements.modelsCheckboxes.querySelectorAll('input'), ...elements.featuresCheckboxes.querySelectorAll('input')].forEach(el => {
            el.addEventListener('input', validateSubmission);
            el.addEventListener('change', validateSubmission);
        });

        elements.projectSearchInput.addEventListener('debounce', async () => {
            state.currentSearchTerm = elements.projectSearchInput.value;
            elements.userProjectsContainer.innerHTML = ''; // Clear previous results
            state.userProjectsCursor = null; // Reset cursor for new search
            await fetchUserProjects(null, state.currentSearchTerm);
        });
        
        let debounceTimer;
        elements.projectSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                elements.projectSearchInput.dispatchEvent(new Event('debounce'));
            }, 500);
        });

        elements.userProjectsContainer.addEventListener('scroll', () => {
            const el = elements.userProjectsContainer;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 5) {
                if (!state.allProjectsLoaded) {
                    fetchUserProjects(state.userProjectsCursor, state.currentSearchTerm);
                }
            }
        });

        window.websim.addEventListener('comment:created', handleNewComment);
        
    } catch (error) {
        console.error("Initialization failed:", error);
        document.body.innerHTML = '<h1>Error initializing contest page. Are you on Websim?</h1>';
    }
}

init();