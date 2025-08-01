import { marked } from 'marked';
import DOMPurify from 'dompurify';

const WEBSIM_URL_REGEX = /https?:\/\/(?:www\.)?websim\.(?:com|ai)\/(?:[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+|p\/[a-zA-Z0-9-]+|project\/[a-zA-Z0-9-]+)/i;

const state = {
    projectId: null,
    commentsCursor: null,
    isLoading: false,
    allCommentsLoaded: false,
};

const elements = {
    entriesContainer: document.getElementById('entries-container'),
    loadingIndicator: document.getElementById('loading-indicator'),
    postEntryButton: document.getElementById('post-entry-button'),
    totalTipPool: document.getElementById('total-tip-pool'),
};

function sanitizeAndParseMarkdown(rawContent) {
    const dirtyHtml = marked.parse(rawContent, { async: false });
    return DOMPurify.sanitize(dirtyHtml);
}

function createEntryCard(comment) {
    const { author, raw_content } = comment.comment;

    const card = document.createElement('div');
    card.className = 'entry-card';
    card.dataset.commentId = comment.comment.id;

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
    contentDiv.innerHTML = sanitizeAndParseMarkdown(raw_content);

    card.appendChild(header);
    card.appendChild(contentDiv);
    
    return card;
}

function renderEntry(comment) {
    const isEntry = WEBSIM_URL_REGEX.test(comment.comment.raw_content);
    if (!isEntry) {
        return; // Not a valid contest entry
    }
    
    // Avoid re-rendering existing entries
    if (document.querySelector(`.entry-card[data-comment-id="${comment.comment.id}"]`)) {
        return;
    }
    
    const card = createEntryCard(comment);
    elements.entriesContainer.prepend(card); // Prepend to show newest first
}


async function fetchComments(cursor = null) {
    if (state.isLoading || state.allCommentsLoaded) return;
    
    state.isLoading = true;
    elements.loadingIndicator.classList.remove('hidden');

    try {
        const params = new URLSearchParams();
        if (cursor) {
            params.append('after', cursor);
        }
        params.append('first', 20); // Fetch a decent batch size

        const response = await fetch(`/api/v1/projects/${state.projectId}/comments?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const { comments } = await response.json();
        
        comments.data.forEach(renderEntry);
        
        state.commentsCursor = comments.meta.end_cursor;
        if (!comments.meta.has_next_page) {
            state.allCommentsLoaded = true;
            elements.loadingIndicator.classList.add('hidden');
        }
    } catch (error) {
        console.error("Failed to fetch comments:", error);
    } finally {
        state.isLoading = false;
        if(!state.allCommentsLoaded) {
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
            const params = new URLSearchParams({ only_tips: 'true', first: 50 });
            if (cursor) {
                params.append('after', cursor);
            }
            const response = await fetch(`/api/v1/projects/${state.projectId}/comments?${params.toString()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
        elements.totalTipPool.textContent = poolAmount.toLocaleString();

    } catch (error) {
        console.error("Failed to fetch tips:", error);
        elements.totalTipPool.textContent = 'Error';
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

function handleNewComment(event) {
    const { comment } = event;

    // Check if it's a contest entry and render it
    const isEntry = WEBSIM_URL_REGEX.test(comment.raw_content);
    if (isEntry) {
         renderEntry({ comment: comment, cursor: event.cursor });
    }

    // Check if it's a tip and update the pool
    if (comment.card_data && comment.card_data.type === 'tip_comment') {
        console.log('New tip received! Recalculating prize pool.');
        fetchAllTipsAndCalcPool();
    }
}

async function init() {
    try {
        const project = await window.websim.getCurrentProject();
        state.projectId = project.id;
        
        await Promise.all([
            fetchComments(),
            fetchAllTipsAndCalcPool()
        ]);
        
        window.addEventListener('scroll', handleScroll);
        elements.postEntryButton.addEventListener('click', handlePostEntry);
        window.websim.addEventListener('comment:created', handleNewComment);
        
    } catch (error) {
        console.error("Initialization failed:", error);
        document.body.innerHTML = '<h1>Error initializing contest page. Are you on Websim?</h1>';
    }
}

init();

