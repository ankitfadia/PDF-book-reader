
    const pdfUrl = `demo.pdf`;             
    const pdfjsLib = window['pdfjs-dist/build/pdf'];

    // Set the worker source for PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'assest/js/pdf.worker.min.js';

    const userId = 1;
    const bookId = 10;
    const container = document.getElementById('pdf-container');

    const searchInput = document.getElementById('search-input');
    const resultsInfo = document.getElementById('results-info');
    const prevButton = document.getElementById('prev-result');
    const nextButton = document.getElementById('next-result');
    
    const singleViewButton = document.getElementById('single_book');
    const doubleViewButton = document.getElementById('double-out');
    const tocContainer = document.getElementById('toc-container');
    const fullViewButton = document.getElementById('full-screen');
    
    const currentPageSpan = document.getElementById('current-page');
    const totalPagesSpan = document.getElementById('total-pages');
    const totalPercentSpan = document.getElementById('total-percent');
    const seekBar = document.getElementById('seek-bar');
    const canvas = document.getElementById('canvas');
    const canvasContainer = document.getElementById('pdf-container');
    const context = canvas.getContext('2d');

    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageNumbersContainer = document.getElementById('page-numbers');
    
    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 0;
    let currentZoomLevel = 0;
    // Variables for search functionality
    let searchMatches = [];
    let currentMatchIndex = -1;
    
    // Fetch and load the PDF
    pdfjsLib.getDocument(pdfUrl).promise.then(function(pdf) {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        updateButtonState();
        renderPage(currentPage); // Initially render the first page
        createPaginationButtons(totalPages);

    // Fetch the Table of Contents (Outline) if available
    pdfDoc.getOutline().then(function(outline) {
        if (outline && outline.length > 0) 
        {
            createTableOfContents(outline);
        }
        else 
        {
        tocContainer.innerHTML = `
            <div id="toc-header">
                <h6>Table of contents</h6>
                 <button id="toc-close-btn" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <path d="M13.6365 14.8488L9.99998 11.2123L6.36343 14.8488L5.15125 13.6366L8.78779 10.0001L5.15125 6.36355L6.36343 5.15137L9.99998 8.78792L13.6365 5.15137L14.8487 6.36355L11.2122 10.0001L14.8487 13.6366L13.6365 14.8488Z" fill="#373737"/>
</svg></button>
            </div>
            <div class="toc-message">Data not available</div>
        `;
        tocContainer.style.display = 'none';

        // Add event listener to the close button
        const closeBtn = document.getElementById('toc-close-btn');
        closeBtn.addEventListener('click', () => {
            tocContainer.style.display = 'none'; // Hide the TOC popup
        });
      }
    });
    }).catch(function(error) {
        console.error('Error loading PDF:', error);
    });
    
    // Render pages
    let fixedScale = null;
    let isFullScreen = false;
    function renderPage(pageNumber) {
            pdfDoc.getPage(pageNumber).then(function(page) {
            
            let scale;
            // Check if in fullscreen mode
            if (isFullScreen) {
                // Keep fixed scale for fullscreen (first time only)
                if (fixedScale === null) {
                    const canvasDefaultScale = canvasContainer.clientWidth / page.getViewport({ scale: 1 }).width;
                    fixedScale = currentZoomLevel + canvasDefaultScale;
                }
                scale = fixedScale;
            } else {
                // Outside fullscreen, allow zoom to work dynamically
                const canvasDefaultScale = canvasContainer.clientWidth / page.getViewport({ scale: 1 }).width;
                scale = currentZoomLevel + canvasDefaultScale;
                fixedScale = null; // Reset fixedScale when exiting fullscreen
            }
            
            const viewport = page.getViewport({scale: scale});

            // Clear the container
            container.innerHTML = '';

            // Create a container for each page
            const pageContainer = document.createElement('div');
            pageContainer.id = `page-container-${pageNumber}`;
            pageContainer.style.position = 'relative';
            pageContainer.style.marginBottom = '20px';
            pageContainer.style.width = `${viewport.width}px`;  
            pageContainer.style.height = `${viewport.height}px`;
            
            // Create a unique canvas for each page
            canvas.id = `canvas-page-${pageNumber}`;
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            pageContainer.appendChild(canvas);

            // Create a unique text layer for each page
            const textLayerDiv = document.createElement('div');
            textLayerDiv.id = `text-layer-page-${pageNumber}`;
            textLayerDiv.className = 'textLayer';
            textLayerDiv.style.position = 'absolute';
            textLayerDiv.style.top = '0';
            textLayerDiv.style.left = '0';
            textLayerDiv.style.height = `${viewport.height}px`;
            textLayerDiv.style.width = `${viewport.width}px`;
            pageContainer.appendChild(textLayerDiv);

            // Append the page container to the main container
            container.appendChild(pageContainer);

            // Render the page content on the canvas
            const renderContext = {
                canvasContext: context,
                viewport: viewport,
            };

            // Fetch annotations
             fetchAnnotations(pageNumber, viewport, pageContainer, userId, bookId);

           page.render(renderContext).promise.then(function () {

                // Render the text layer content
                page.getTextContent().then(function (textContent) {

                const percentage = ((pageNumber / totalPages) * 100);

                // Dynamically change the width of the .fillColor class
                    const fillColorElement = document.querySelector('.fillColor');
                    if (fillColorElement) 
                    {
                        fillColorElement.style.width = `${percentage}%`; 
                    }

                    pdfjsLib.renderTextLayer({
                        textContent: textContent,
                        container: textLayerDiv,
                        viewport: viewport,
                    }).promise.then(function ()  {
                        highlightMatches(pageNumber);
                        console.log(`Text layer for page ${pageNumber} rendered successfully.`);
                    }).catch((err) => {
                        console.error(`Error rendering text layer for page ${pageNumber}:`, err);
                    });
                });
            });

        });
    }

// Search functionality
function searchText() {

    document.getElementById('spinner').style.display = 'inline-block';

    const query = searchInput.value.trim().toLowerCase();

    // If input is empty, clear highlights and return
    if (!query) {
        clearHighlights();
        resultsInfo.textContent = "";
        document.getElementById('spinner').style.display = 'none';
        return;
    }

    // Split query into words
    const queryWords = query.split(/\s+/); // Split by whitespace into an array

    searchMatches = [];
    currentMatchIndex = -1;

    const searchPromises = [];
    for (let i = 1; i <= totalPages; i++) {
        searchPromises.push(
            pdfDoc.getPage(i).then(function (page) {
                return page.getTextContent().then(function (textContent) {
                    const text = textContent.items.map(item => item.str).join(' ').toLowerCase();

                    // Check if any of the query words are in the text
                    const fullQuery = queryWords.join(" ");
                    const hasMatch = text.includes(fullQuery);
                    if (hasMatch) {
                        searchMatches.push({ pageNumber: i, text, query: fullQuery });
                    }
                });
            })
        );
    }

    Promise.all(searchPromises).then(function () {
        // Sort matches by page number ascending
        searchMatches.sort((a, b) => a.pageNumber - b.pageNumber);

        if (searchMatches.length > 0) {
            currentMatchIndex = 0;
            renderSearchResult();
        } else {
            resultsInfo.textContent = 'No matches found.';
        }

        // Hide the spinner after search completes
        document.getElementById('spinner').style.display = 'none';

    });
}

// Function to clear highlights
function clearHighlights() {
    document.querySelectorAll('.highlight').forEach(el => {
        el.replaceWith(document.createTextNode(el.textContent)); // Restore original text
    });
}

// Highlight search matches
function highlightMatches(pageNumber) {
    const match = searchMatches.find(match => match.pageNumber === pageNumber);

    if (match) {
        const query = Array.isArray(match.query) ? match.query.join(" ") : match.query;
        const textLayerDiv = document.getElementById(`text-layer-page-${pageNumber}`);

        if (!textLayerDiv) {
            console.warn(`Text layer for page ${pageNumber} not found.`);
            return;
        }

        const regex = new RegExp(escapeRegex(query), 'gi');
        const textItems = textLayerDiv.querySelectorAll('span');

        textItems.forEach(span => {
            const originalText = span.textContent;
            const highlightedText = originalText.replace(regex, (found) => {
                return `<span class="highlight" style="opacity: 0.5; position: relative;">${found}</span>`;
            });

            if (highlightedText !== originalText) {
                span.innerHTML = highlightedText;
            }
        });
    }
}



// Render search result and update pagination
function renderSearchResult() {
    if (currentMatchIndex < 0 || currentMatchIndex >= searchMatches.length) {
        resultsInfo.textContent = "No matches found";
        return;
    }

    const match = searchMatches[currentMatchIndex];
    currentPage = match.pageNumber || 1; // Default to page 1 if pageNumber is undefined
    renderPage(currentPage); // Load and render the current page

    console.log("Match:", match); // Debugging: Log the structure of the current match

    const queryWords = Array.isArray(match.query) ? match.query : [];
    const pageText = match.text || "";

    // Helper function to count matches in text for given words
    const countMatches = (text, words) =>
        words.reduce((count, word) => {
            const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
            const matches = text.match(regex);
            return count + (matches ? matches.length : 0);
        }, 0);

    // Count matches for the current page
    const currentPageMatches = countMatches(pageText, queryWords);

    // Current match index
    const currentMatchNumber = currentMatchIndex + 1;

    // Total number of matches:
    const totalMatchedWords = searchMatches.length;

    // Update results info text
    resultsInfo.textContent = `Result ${currentMatchNumber} of ${totalMatchedWords} matched words`;

    // Highlight matches on the current page
    highlightMatches(currentPage);
}

function escapeRegex(string) {
    return string.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}



// Navigate to next search result
nextButton.addEventListener('click', function () {
    if (currentMatchIndex < searchMatches.length - 1) {
        currentMatchIndex++;
        renderSearchResult();
        createPaginationButtons(totalPages);
        updateButtonState();
    }
});

// Navigate to previous search result
prevButton.addEventListener('click', function () {
    if (currentMatchIndex > 0) {
        currentMatchIndex--;
        renderSearchResult();
        createPaginationButtons(totalPages);
        updateButtonState();
    }
});

// Trigger search on text keyup
searchInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') searchText(e);
});

document.getElementById('search-result').addEventListener('click', searchText);

    
    function updateButtonState() 
    {
        
    // Disable "previous" button if on the first page
    if (currentPage <= 1) {
        prevPageBtn.disabled = true;
        prevPageBtn.style.cursor = 'not-allowed';
        prevPageBtn.style.opacity = '0.5';
    } else {
        prevPageBtn.disabled = false;
        prevPageBtn.style.cursor = '';
        prevPageBtn.style.opacity = '';
    }

    // Disable "next" button if on the last page
    if (currentPage >= totalPages) {
        nextPageBtn.disabled = true;
        nextPageBtn.style.cursor = 'not-allowed';
        nextPageBtn.style.opacity = '0.5';
    } else {
        nextPageBtn.disabled = false;
        nextPageBtn.style.cursor = '';
        nextPageBtn.style.opacity = '';
    }
}


    // Event listener for previous page button
    document.getElementById('prev-page').addEventListener('click', function() {
        if (currentPage <= 1) return; // Don't go below page 1
        currentPage--;
        renderPage(currentPage);
        updateButtonState();
        createPaginationButtons(totalPages);
    });

    // Event listener for next page button
    document.getElementById('next-page').addEventListener('click', function() {
        if (currentPage >= totalPages) return; // Don't go beyond the last page
        currentPage++;
        renderPage(currentPage);
        updateButtonState();
        createPaginationButtons(totalPages);
    });


// Full page view
fullViewButton.addEventListener('click', function () {

    // Enable fullscreen mode for the container
    if (container.requestFullscreen) {
        container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen(); // For Safari
    } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen(); // For IE/Edge
    }
     // Apply styles to ensure proper alignment and scrolling
    container.style.overflowY = 'auto'; // Enable vertical scrolling
    container.style.display = 'flex'; 
    container.style.justifyContent = 'center'; // Center horizontally
    container.style.boxSizing = 'border-box'; // Prevent layout issues with padding or borders

    isFullScreen = true;

    // Recalculate fixedScale here too
    pdfDoc.getPage(currentPage).then(page => {
        const canvasDefaultScale = canvasContainer.clientWidth / page.getViewport({ scale: 1 }).width;
        fixedScale = currentZoomLevel + canvasDefaultScale;
        renderPage(currentPage); // force re-render to update scale
    });

    console.log('Scrollable full-page view enabled with centered content');
});

// Handle arrow key navigation in fullscreen mode
document.addEventListener('keydown', function (e) 
{
    if (document.fullscreenElement) 
    {
        if (e.key === 'ArrowLeft') 
        {
            if (currentPage <= 1) return; // Don't go below page 1
            currentPage--;
            renderPage(currentPage);
            updateButtonState();
        } 
        else if (e.key === 'ArrowRight') 
        {
            if (currentPage >= totalPages) return; // Don't go beyond the last page
            currentPage++;
            renderPage(currentPage);
            updateButtonState();
        }
    }
});

// Listen for fullscreen exit and reset styles
document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement) 
    {
        container.style.overflowY = ''; // Reset to default
        container.style.display = ''; 
        container.style.justifyContent = '';
        container.style.boxSizing = '';
        isFullScreen = false;
        fixedScale = null; // Reset fixedScale when exiting fullscreen
        renderPage(currentPage);
        console.log('Exited full-page view, styles reset');
    }
    else 
    {
        isFullScreen = true;
    }
});



document.getElementById('my-notes').addEventListener('click', function () {
    const tocContainer = document.getElementById('toc-container');

    if (tocContainer.style.display === 'none' || tocContainer.style.display === '') {
        tocContainer.style.display = 'block';
    } else {
        tocContainer.style.display = 'none';
    }
});



// Function to create the Table of Contents (TOC)
function createTableOfContents(outline) {
    tocContainer.innerHTML = `
        <div id="toc-header">
            <h6>Table of contents</h6>
            <button id="toc-close-btn" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <path d="M13.6365 14.8488L9.99998 11.2123L6.36343 14.8488L5.15125 13.6366L8.78779 10.0001L5.15125 6.36355L6.36343 5.15137L9.99998 8.78792L13.6365 5.15137L14.8487 6.36355L11.2122 10.0001L14.8487 13.6366L13.6365 14.8488Z" fill="#373737"/>
</svg></button>
        </div>
    `; // Title for the TOC section

    const tocContent = document.createElement('div'); // Container for TOC entries
    tocContent.classList.add('toc-content');

    // Recursive function to process the outline and its sub-outlines
    function processOutline(items, parentElement) {
        items.forEach((item) => {
          
            const tocEntry = document.createElement('div');
            tocEntry.classList.add('toc-entry');

            const tocLink = document.createElement('a');
            tocLink.textContent = item.title.trim(); // Trims leading/trailing whitespace

            if (item.dest && item.dest[0] && item.dest[0].num !== undefined) 
            {
                const destRef = Array.isArray(item.dest) ? item.dest[0] : item.dest;
                pdfDoc.getPageIndex(destRef).then((pageIndex) => {
                const pageNumber = pageIndex + 1; // Convert zero-based index
                
                // Extract the page number from the 'num' property
                tocLink.href = `#page-container-${pageNumber}`; // Correctly set page number in link

                tocLink.addEventListener('click', function (e) {
                    e.preventDefault(); 
                    currentPage = pageNumber;
                    createPaginationButtons(totalPages);
                    renderPage(currentPage);
                    updateButtonState();
                    });
                });
            } else 
            {
                tocLink.style.cursor = 'default';
                tocLink.style.color = 'gray';
            }

            tocEntry.appendChild(tocLink);
            parentElement.appendChild(tocEntry);

            // If the item has sub-outline (children), process them recursively
            if (item.items && item.items.length > 0) {
                const subOutlineContainer = document.createElement('div');
                subOutlineContainer.classList.add('sub-outline');
                tocEntry.appendChild(subOutlineContainer);
                processOutline(item.items, subOutlineContainer); // Recursive call
            }
        });
    }

    processOutline(outline, tocContent); // Start processing the main outline
    tocContainer.appendChild(tocContent); // Append the processed TOC to the container

    // Add event listener to the close button
    const closeBtn = document.getElementById('toc-close-btn');
    closeBtn.addEventListener('click', () => {
        tocContainer.style.display = 'none'; // Hide the TOC popup
    });
}



let selectedText = '';
let isHighlighting = true;
let currentPopup = null;
let currentHighlightDiv = null;

// Event listener for text selection
document.addEventListener('mouseup', function (e) {

    if (!isHighlighting || e.target.closest('.bookHeader') || e.target.closest('#toolbar') || e.target.closest('.controls') || e.target.closest('.comment-box') || e.target.closest('#editModal')) return;

    // Check if the click was on the scrollbar
    const isScrollbarClick = (e.clientX >= document.documentElement.clientWidth || e.clientY >= document.documentElement.clientHeight);

    if (isScrollbarClick) {
        return; 
    }
 
    const selection = window.getSelection();
    
    if (selection.rangeCount > 0) 
    {
        const range = selection.getRangeAt(0);
        text = selection.toString().trim();

        // Only proceed if text is selected
        if (text) 
        {
            
            //Check cookie size BEFORE saving annotation
            const cookieKey = `annotations_${currentUserId}_${currentBookId}`;
            const existing = getAnnotationsFromCookie(cookieKey) || [];

            const cookieValue = JSON.stringify(existing);
            const cookieString = `${cookieKey}=${encodeURIComponent(cookieValue)}; path=/; max-age=${7 * 24 * 60 * 60}`;

            if (cookieString.length > 4000) {
                alert("Annotation storage limit reached. Please delete some annotations before adding new ones.");
                return; // Stop here — don't allow highlight saving
            }

            selectedText = text;
            const rect = range.getBoundingClientRect();

            // Find the corresponding page container
            let pageContainer = null;
            document.querySelectorAll('[id^="page-container-"]').forEach(container => {
                const containerRect = container.getBoundingClientRect();
                if (
                    rect.top >= containerRect.top &&
                    rect.bottom <= containerRect.bottom &&
                    rect.left >= containerRect.left &&
                    rect.right <= containerRect.right
                ) {
                    pageContainer = container;
                }
            });

            if (!pageContainer) {
                console.error("Page container not found.");
                return;
            }

            // Extract page number from pageContainer id
            const pageNumber = parseInt(pageContainer.id.split('-')[2], 10);
            if (isNaN(pageNumber)) {
                console.error("Failed to extract page number.");
                return;
            }

            // Find the annotation layer for the current page
            const annotationLayer = pageContainer.querySelector(`[id^="text-layer-page-"]`);
            if (!annotationLayer) {
                console.error("Annotation layer not found.");
                return;
            }

            const bounds = {
                x: (rect.left - pageContainer.getBoundingClientRect().left) ,
                y: (rect.top - pageContainer.getBoundingClientRect().top),
                width: rect.width,
                height: rect.height,
            };

            if (currentPopup) {
                currentPopup.remove();
                currentPopup = null;
            }

            const existingCommentBox = document.querySelector('.comment-box');
            if (existingCommentBox) {
                existingCommentBox.remove();
            }

            // Create a new highlightDiv
            const highlightDiv = document.createElement('div');
            highlightDiv.classList.add('annotation');
            highlightDiv.style.background = 'rgba(255, 255, 0)'; // Default highlight color
            highlightDiv.style.position = 'absolute';
            highlightDiv.style.left = `${bounds.x}px`;
            highlightDiv.style.top = `${bounds.y}px`;
            highlightDiv.style.width = `${bounds.width}px`;
            highlightDiv.style.height = `${bounds.height}px`;

            // Save the current highlightDiv
            currentHighlightDiv = highlightDiv;

            // Simulate a viewport object for demo purposes
            const viewport = { width: annotationLayer.offsetWidth, height: annotationLayer.offsetHeight };
            annotationLayer.appendChild(highlightDiv);

            // Save the annotation
            saveAnnotation(pageNumber, annotationLayer, highlightDiv, viewport, selectedText, userId, bookId);

            // Open the comment input popup
            currentPopup = openCommentInput(event, pageNumber, viewport, highlightDiv, selectedText);

            // Log the coordinates of the selection
            console.log('Selected text:', selection.toString());
            console.log('Coordinates:', {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            });
    }
    else
    {
        const parentPopupBox = event.target.closest('.popup-box');
        const parentCommentBox = event.target.closest('.comment-box');
        if (!parentPopupBox && !parentCommentBox) 
        {
            // Close the action pop-up
            if (currentPopup) 
            {
                currentPopup.remove();
                currentPopup = null;
            }
            const existingCommentBox = document.querySelector('.comment-box');
            if (existingCommentBox) 
            {
                existingCommentBox.remove();
            }
            
        }
        
    }
}
});



function openCommentInput(event, pageNumber, viewport, highlightDiv, selectedText, id) {
    
    // Set the ID of the currently selected annotation

    lastInsertedId = id; 

    const annotationLayer = document.querySelector(`#text-layer-page-${pageNumber}`);

    if (!annotationLayer) {
        console.error("Annotation layer not found.");
        return;
    }

    const rect = annotationLayer.getBoundingClientRect();

    // Create the popup container
    const popup = document.createElement('div');
    popup.classList.add('popup-box');
    popup.style.position = 'absolute';
    popup.style.left = `${event.clientX - rect.left}px`;
    popup.style.top = `${event.clientY - rect.top}px`;
    popup.style.backgroundColor = '#fff';
    popup.style.border = '1px solid #ccc';
    popup.style.borderRadius = '8px';
    popup.style.padding = '10px';
    popup.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    popup.style.zIndex = '1000';

    // Add color picker and comment icon
    popup.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
        <div id="colorCircle5" class="colorpicker" style="width: 24px; height: 24px; border-radius: 50%; background-color: #FFFF00; cursor: pointer;" title="Yellow"></div>
        <div id="colorCircle3" class="colorpicker" style="width: 24px; height: 24px; border-radius: 50%; background-color: #33ff57; cursor: pointer;" title="Green"></div>
        <div id="colorCircle1" class="colorpicker" style="width: 24px; height: 24px; border-radius: 50%; background-color: #ff5733; cursor: pointer;" title="Red"></div>
        <div id="colorCircle2" class="colorpicker" style="width: 24px; height: 24px; border-radius: 50%; background-color: #33cfff; cursor: pointer;" title="Blue"></div>
        <div id="colorCircle4" class="colorpicker" style="width: 24px; height: 24px; border-radius: 50%; background-color: #8A2BE2; cursor: pointer;" title="Violet"></div>
            <span class="editIcon fa-edit" id="update-comment-pop">
                <i>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" 
                viewBox="0 0 24 24" fill="none" stroke="currentColor" 
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                </i>
                </span>
                    <span class="editIcon editIcon2" id="pop-delete-icon">
            		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4c9dab" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
                </span>
        </div>
    `;

    annotationLayer.appendChild(popup);

    // Add event listener to the color picker
    ['#colorCircle1', '#colorCircle2', '#colorCircle3', '#colorCircle4', '#colorCircle5'].forEach((circleId) => {
        popup.querySelector(circleId).addEventListener('click', (event) => {

            const selectedColor = getComputedStyle(event.target).backgroundColor;
           
            removeDuplicateAnnotations(currentHighlightDiv);
            highlightDiv.style.background = selectedColor;
            highlightDiv.style.opacity = '0.5';
            updateAnnotationColor(selectedColor);
        });
    });

    // Add delete functionality to the delete button inside the popup
    const deleteButton = document.getElementById('pop-delete-icon');
    deleteButton.onclick = () => deleteLastAnnotation(highlightDiv);

    // Handle comment box logic
    popup.querySelector('.fa-edit').addEventListener('click', function () {
        const existingCommentBox = document.querySelector('.comment-box');
        if (existingCommentBox) {
            existingCommentBox.remove();
        }
        const commentBox = document.createElement('div');
        commentBox.classList.add('comment-box');
        commentBox.style.position = 'absolute';
        commentBox.style.left = `${event.clientX - rect.left}px`;
        commentBox.style.top = `${event.clientY - rect.top + 25}px`;
        commentBox.innerHTML = `
             <h6>Note</h6>
            <p>“${selectedText}”</p>
            <textarea placeholder="My note text" required></textarea>
            <div class="btnAlign">
            <button class="cancel-comment">Cancel</button>
            <button class="save-comment">Save</button>
            </div>
        `;

        annotationLayer.appendChild(commentBox);
        popup.remove();

        commentBox.querySelector('.save-comment').addEventListener('click', () => {
            
            const commentText = commentBox.querySelector('textarea').value;

            if (commentText === '') 
            {
                alert('Please add text before saving.'); // Alert message if empty
                
            } else {
            const rect = highlightDiv.getBoundingClientRect();
            const layerRect = annotationLayer.getBoundingClientRect();
           
            const x = (rect.left - layerRect.left) / viewport.width;
            const y = (rect.top - layerRect.top) / viewport.height;
            const width = rect.width / viewport.width;
            const height = rect.height / viewport.height;

            // Fetch the background color from highlightDiv
            const background_color = highlightDiv.style.background;

            saveComment(commentText, commentBox, highlightDiv);
        }
        });

        commentBox.querySelector('.cancel-comment').addEventListener('click', () => {
            commentBox.remove();
            // highlightDiv.remove();
            currentPopup = null;
            currentHighlightDiv = null;
        });
    });

     return popup;
}

// Delete last inserted annotation
function deleteLastAnnotation(highlightDiv) {
    // 1. Load from cookie if needed
    if (!lastInsertedId) {
        const idKey = `lastInsertedId_${currentUserId}_${currentBookId}`;
        lastInsertedId = parseInt(getCookie(idKey));
        console.log('Loaded lastInsertedId from cookie:', lastInsertedId);
    }

    if (!lastInsertedId) {
        console.warn('No annotation ID to delete.');
        return;
    }

    const cookieKey = `annotations_${currentUserId}_${currentBookId}`;
    const annotations = getAnnotationsFromCookie(cookieKey);

    if (!Array.isArray(annotations)) {
        console.warn('Annotations not found in cookie.');
        return;
    }

    // 2. Filter out the deleted one
    const updatedAnnotations = annotations.filter(a => a.id !== lastInsertedId);
    setCookie(cookieKey, JSON.stringify(updatedAnnotations), 7);

    // 3. Remove cookie ID
    setCookie(`lastInsertedId_${currentUserId}_${currentBookId}`, '', -1);
    console.log(`Deleted annotation ${lastInsertedId} from cookie.`);

    // 4. Remove from DOM
    const allHighlights = document.querySelectorAll('.annotation');
    const refRect = highlightDiv?.getBoundingClientRect();

    allHighlights.forEach(div => {
        const rect = div.getBoundingClientRect();
        const isSame =
            refRect &&
            Math.abs(rect.left - refRect.left) < 2 &&
            Math.abs(rect.top - refRect.top) < 2 &&
            Math.abs(rect.width - refRect.width) < 2 &&
            Math.abs(rect.height - refRect.height) < 2;

        const matchesId = div.dataset.annotationId == lastInsertedId;

        if (matchesId || isSame) {
            div.remove();
            console.log('Removed highlight:', div);
        }
    });

    // 5. Cleanup
    lastInsertedId = null;
    currentHighlightDiv = null;

    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
}





let lastAnnotation = null;
function saveAnnotation(pageNumber, annotationLayer, highlightDiv, viewport, selectedText, userId, bookId) {
     
    const rect = highlightDiv.getBoundingClientRect();
    const layerRect = annotationLayer.getBoundingClientRect();

    const x = (rect.left - layerRect.left) / viewport.width;
    const y = (rect.top - layerRect.top) / viewport.height;
    const width = rect.width / viewport.width;
    const height = rect.height / viewport.height;

    // Fetch the background color from highlightDiv
    const background_color = highlightDiv.style.background;

    if (width > 0 && height > 0) {
        // Generate unique ID using timestamp + random number
        const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        
        lastAnnotation = { id, pageNumber, x, y, width, height, background_color, selectedText, userId, bookId };
        lastInsertedId = id;
        console.log('Saved annotation to cookie:', lastAnnotation);

        const cookieKey = `annotations_${userId}_${bookId}`;
        const existing = getAnnotationsFromCookie(cookieKey);
        existing.push(lastAnnotation);
        setCookie(cookieKey, JSON.stringify(existing), 7); // Store for 7 days
        setCookie(`lastInsertedId_${currentUserId}_${currentBookId}`, lastInsertedId, 1);

        fetchCurrentAnnotations(pageNumber, viewport, annotationLayer, userId, bookId, lastInsertedId); // optional
    } else {
        console.log('No valid annotation to save.');
    }
}


// Function to update highlighted text color
const currentUserId = 1;
const currentBookId = 10;
function updateAnnotationColor(color) {
    // Try to use global first; fallback to cookie
    //console.log(lastInsertedId);
    const cookieKey = `annotations_${currentUserId}_${currentBookId}`;
    const idKey = `lastInsertedId_${currentUserId}_${currentBookId}`;

    if (!lastInsertedId) {
        lastInsertedId = parseInt(getCookie(idKey));
        console.log('Loaded lastInsertedId from cookie:', lastInsertedId);
    }

    if (!lastInsertedId) {
        console.warn('No annotation ID to update.');
        return;
    }

    const annotations = getAnnotationsFromCookie(cookieKey);

    const updatedAnnotations = annotations.map(annotation => {
        if (annotation.id === lastInsertedId) {
            annotation.background_color = color;
        }
        return annotation;
    });

    setCookie(cookieKey, JSON.stringify(updatedAnnotations), 7);

    console.log(`Updated color of annotation ${lastInsertedId}`);
}




// Save comment
function saveComment(comment, commentBox, highlightDiv) {
    // Fallback to cookie if lastInsertedId is missing
    if (!lastInsertedId) {
        const idKey = `lastInsertedId_${currentUserId}_${currentBookId}`;
        lastInsertedId = parseInt(getCookie(idKey));
        console.log('Loaded lastInsertedId from cookie:', lastInsertedId);
    }

    if (!lastInsertedId) {
        console.warn('No annotation ID to update comment.');
        return;
    }

    const cookieKey = `annotations_${currentUserId}_${currentBookId}`;
    const annotations = getAnnotationsFromCookie(cookieKey);

    if (!annotations || !Array.isArray(annotations)) {
        console.warn('No annotations found in cookie.');
        return;
    }

    let updated = false;

    const updatedAnnotations = annotations.map(annotation => {
        if (annotation.id === lastInsertedId) {
            annotation.comment = comment;
            updated = true;
        }
        return annotation;
    });

    if (!updated) {
        console.warn('Annotation ID not found in cookie.');
        return;
    }

    setCookie(cookieKey, JSON.stringify(updatedAnnotations), 7);
    setCookie(`lastInsertedId_${currentUserId}_${currentBookId}`, lastInsertedId, 1); // update cookie if needed

    console.log(`Comment for annotation ${lastInsertedId} saved to cookie.`);

    // Remove the comment input box
    if (commentBox) commentBox.remove();

    // Add the comment icon if not already present
    if (highlightDiv && !highlightDiv.querySelector('.fa-list')) {
        const icon = document.createElement('i');
        icon.classList.add('fa', 'fa-list');
        icon.style.position = 'absolute';
        icon.style.right = '0';
        icon.style.fontSize = '12px';
        highlightDiv.appendChild(icon);
    }
}




function fetchAnnotations(pageNumber, viewport, annotationLayer, userId, bookId) {
    if (!annotationLayer) {
        console.error(`Annotation layer for page ${pageNumber} not found.`);
        return;
    }

    const cookieKey = `annotations_${userId}_${bookId}`;
    const allAnnotations = getAnnotationsFromCookie(cookieKey);

    if (!allAnnotations || allAnnotations.length === 0) {
        console.warn('No annotations found in cookie.');
        return;
    }

    // Filter by current page
    const pageAnnotations = allAnnotations.filter(a => parseInt(a.pageNumber) === parseInt(pageNumber));

    pageAnnotations.forEach(annotation => {
        const {
            id = null,
            x, y, width, height,
            background_color,
            selectedText: highlighted_text,
            comment = null
        } = annotation;

        const highlightDiv = document.createElement('div');
        highlightDiv.classList.add('annotation');

        highlightDiv.style.backgroundColor = background_color || '';
        highlightDiv.style.opacity = background_color && background_color !== 'rgba(255, 255, 0, 0.5)' ? '0.5' : '';

        highlightDiv.style.left = `${x * viewport.width}px`;
        highlightDiv.style.top = `${y * viewport.height}px`;
        highlightDiv.style.width = `${width * viewport.width}px`;
        highlightDiv.style.height = `${height * viewport.height}px`;
        highlightDiv.style.position = 'absolute';
        highlightDiv.style.cursor = 'pointer';
        //highlightDiv.style.background = background_color || '';

        if (comment) {
            const icon = document.createElement('i');
            icon.classList.add('fa', 'fa-list');
            icon.style.position = 'absolute';
            icon.style.right = '0';
            icon.style.fontSize = '12px';
            highlightDiv.appendChild(icon);
        }

        highlightDiv.addEventListener('click', (event) => {
            lastInsertedId = id;
            currentHighlightDiv = highlightDiv;
            // console.log(lastInsertedId);
            // console.log(highlightDiv);
            currentPopup = openCommentInput(event, pageNumber, viewport, highlightDiv, highlighted_text, id);

            const deleteButton = document.getElementById('pop-delete-icon');
            deleteButton.onclick = () => deleteLastAnnotation(highlightDiv);

            const commentButton = document.getElementById('update-comment-pop');
            const newCommentButton = commentButton.cloneNode(true);
            commentButton.parentNode.replaceChild(newCommentButton, commentButton);

            newCommentButton.onclick = () => {
                // Always fetch latest comment from cookie
                const cookieKey = `annotations_${currentUserId}_${currentBookId}`;
                const annotations = getAnnotationsFromCookie(cookieKey);
                const matched = annotations.find(a => Number(a.id) === Number(id));
                const comment = matched?.comment || '';

                currentPopup.remove();
                currentPopup = null;

                openCommentBox(id, comment, highlightDiv, highlighted_text);
            };
        });


        annotationLayer.appendChild(highlightDiv);
    });
}




// fetch current annotations

function fetchCurrentAnnotations(pageNumber, viewport, annotationLayer, userId, bookId, newInsertedId = null) {
    if (!annotationLayer) {
        console.error(`Annotation layer for page ${pageNumber} not found.`);
        return;
    }

    const cookieKey = `annotations_${userId}_${bookId}`;
    const annotations = getAnnotationsFromCookie(cookieKey);
//console.log(annotations);
    const pageAnnotations = annotations.filter(a => a.pageNumber === pageNumber);

    pageAnnotations.forEach(annotation => {
        const {
            id,
            x,
            y,
            width,
            height,
            comment = null,
            selectedText: highlighted_text
        } = annotation;

        const highlightDiv = document.createElement('div');
        highlightDiv.classList.add('annotation');
        highlightDiv.style.left = `${x * viewport.width}px`;
        highlightDiv.style.top = `${y * viewport.height}px`;
        highlightDiv.style.width = `${width * viewport.width}px`;
        highlightDiv.style.height = `${height * viewport.height}px`;
        highlightDiv.style.position = 'absolute';
        highlightDiv.style.cursor = 'pointer';

        
        // Add comment icon if present
        if (comment) {
            const icon = document.createElement('i');
            icon.classList.add('fa', 'fa-list');
            icon.style.position = 'absolute';
            icon.style.right = '0';
            icon.style.fontSize = '12px';
            highlightDiv.appendChild(icon);
        }

        // Add click handler
        highlightDiv.addEventListener('click', (event) => {
            lastInsertedId = id;
            currentHighlightDiv = highlightDiv;

            console.log('Clicked annotation, lastInsertedId set:', lastInsertedId);

            currentPopup = openCommentInput(event, pageNumber, viewport, highlightDiv, highlighted_text, id);

            const deleteButton = document.getElementById('pop-delete-icon');
            if (deleteButton) {
                deleteButton.onclick = () => deleteLastAnnotation(highlightDiv);
            }

            const commentButton = document.getElementById('update-comment-pop');
            if (commentButton) {
                const newCommentButton = commentButton.cloneNode(true);
                commentButton.parentNode.replaceChild(newCommentButton, commentButton);

                newCommentButton.onclick = () => {
                    const annotationId = highlightDiv.dataset.annotationId;
                    const allAnnotations = getAnnotationsFromCookie(cookieKey);
                    const matched = allAnnotations.find(a => Number(a.id) === Number(id));
                    const currentComment = matched?.comment || '';
                    currentPopup.remove();
                    currentPopup = null;
                    openCommentBox(annotationId, currentComment, highlightDiv, highlighted_text);
                };
            }
        });

        annotationLayer.appendChild(highlightDiv);
    });
}



function openCommentBox(annotationId, existingComment, highlightDiv, highlighted_text) {
    // Remove any existing comment boxes
    const existingCommentBox = document.querySelector('.comment-box');
    if (existingCommentBox) {
        existingCommentBox.remove();
    }

    // Create a new comment box
    const commentBox = document.createElement('div');
    commentBox.classList.add('comment-box');
    commentBox.style.position = 'absolute';
    commentBox.style.left = `${highlightDiv.style.left}`;
    commentBox.style.top = `${parseFloat(highlightDiv.style.top) + parseFloat(highlightDiv.style.height) + 5}px`; // Adjust below highlight
    commentBox.innerHTML = `
        <p>“${highlighted_text}”</p>
        <textarea class="comment-input" placeholder="My note text">${existingComment || ''}</textarea>
        <div class="btnAlign">
            <button class="cancel-comment">Cancel</button>
            <button class="comment-save">Update</button>
        </div>
    `;

    // Append the comment box to the annotation layer
    highlightDiv.parentElement.appendChild(commentBox);

    // Cancel button functionality
    commentBox.querySelector('.cancel-comment').addEventListener('click', () => {
        commentBox.remove();
    });

    // Save button functionality (pure JS using cookie)
   commentBox.querySelector('.comment-save').addEventListener('click', () => {
    const commentInput = commentBox.querySelector('.comment-input');
    const comment = commentInput.value.trim();

    if (comment === '') {
        alert('Comment cannot be empty.');
        return;
    }

    const cookieKey = `annotations_${currentUserId}_${currentBookId}`;
    const annotations = getAnnotationsFromCookie(cookieKey);
    const updatedAnnotations = annotations.map(annotation => {
        if (Number(annotation.id) === Number(annotationId)) {
            annotation.comment = comment;
        }
        return annotation;
    });

    setCookie(cookieKey, JSON.stringify(updatedAnnotations), 7);
    lastInsertedId = Number(annotationId);
    setCookie(`lastInsertedId_${currentUserId}_${currentBookId}`, lastInsertedId, 1);

    // DOM update: Update icon tooltip or any visible comment preview
    if (highlightDiv) {
        highlightDiv.setAttribute('data-comment', comment); // optional for debugging/tooltip
        const existingIcon = highlightDiv.querySelector('.fa-list');

        if (!existingIcon) {
            const icon = document.createElement('i');
            icon.classList.add('fa', 'fa-list');
            icon.style.position = 'absolute';
            icon.style.right = '0';
            icon.style.fontSize = '12px';
            highlightDiv.appendChild(icon);
        }
    }

    commentBox.remove();
});


}


// Add event listener for the "Show Comment" button
document.getElementById('show-comment').addEventListener('click', function () {

  const commentsContainer = document.getElementById('comments-container');

    if (commentsContainer.style.display === 'none' || commentsContainer.style.display === '') {
        commentsContainer.style.display = 'block';
    } else {
        commentsContainer.style.display = 'none';
    }

    
            // Add header with close button
            commentsContainer.innerHTML = `
                <div id="toc-header">
                    <h6>MY NOTES</h6>
                    <button id="toc-close-btn" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">  <path d="M13.6365 14.8488L9.99998 11.2123L6.36343 14.8488L5.15125 13.6366L8.78779 10.0001L5.15125 6.36355L6.36343 5.15137L9.99998 8.78792L13.6365 5.15137L14.8487 6.36355L11.2122 10.0001L14.8487 13.6366L13.6365 14.8488Z" fill="#373737"/>
</svg></button>
                </div>
            `;

    const cookieKey = `annotations_${currentUserId}_${currentBookId}`;
    const annotations = getAnnotationsFromCookie(cookieKey) || [];

    const commentAnnotations = annotations.filter(a => a.comment && a.comment.trim() !== '');

            if (commentAnnotations.length > 0) {
        commentAnnotations.forEach(comment => {
                    const commentDiv = document.createElement('div');
                    commentDiv.classList.add('comment-item');
                    commentDiv.dataset.commentId = comment.id;

                    // Create link and handle click
                    const commentLink = document.createElement('a');
                    commentLink.href = `#page-container-${comment.pageNumber}`;
                    commentLink.innerHTML = `Page ${comment.pageNumber} <span class="caret-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="17" viewBox="0 0 16 17" fill="none"><path d="M8.5 12.5L3 6.5L14 6.5L8.5 12.5Z" fill="#2A2A2A"/></svg></span>`;
                    commentLink.addEventListener('click', function (e) {
                        e.preventDefault();
                        currentPage = comment.pageNumber;
                        createPaginationButtons(totalPages);
                        renderPage(currentPage);
                        updateButtonState();
                    });

                    // Highlight the title and show the comment content
                    commentDiv.innerHTML = `
                        <span class="commPage"><h3>"${comment.selectedText}" </h3>
                        </span> 
                        <p class="comment-content">${comment.comment}</p>
                        <p class="notsIcons">
                        <span class="edit-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <g opacity="0.8">
                                <path d="M11.77 4.05899L12.4652 3.36383C13.617 2.21206 15.4844 2.21206 16.6362 3.36383C17.7879 4.51561 17.7879 6.38301 16.6362 7.53479L15.941 8.22995M11.77 4.05899C11.77 4.05899 11.8569 5.53621 13.1604 6.83963C14.4638 8.14306 15.941 8.22995 15.941 8.22995M11.77 4.05899L5.37912 10.4499C4.94625 10.8828 4.72981 11.0992 4.54367 11.3379C4.3241 11.6194 4.13585 11.924 3.98226 12.2463C3.85205 12.5195 3.75526 12.8099 3.56167 13.3906L2.74136 15.8516M15.941 8.22995L9.55008 14.6209C9.1172 15.0538 8.90077 15.2702 8.66212 15.4563C8.38061 15.6759 8.07602 15.8641 7.75373 16.0177C7.48052 16.1479 7.19014 16.2447 6.60938 16.4383L4.14844 17.2586M4.14844 17.2586L3.54688 17.4592C3.26108 17.5544 2.94599 17.48 2.73297 17.267C2.51995 17.054 2.44557 16.7389 2.54084 16.4531L2.74136 15.8516M4.14844 17.2586L2.74136 15.8516" stroke="#373737" stroke-width="1.25"/>
                              </g>
</svg></span>
                       <span class="delete-icon"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="18" viewBox="0 0 17 18" fill="none">
                          <path d="M15.6667 4H1.5" stroke="#373737" stroke-width="1.25" stroke-linecap="round"/>
                          <path d="M14.2778 6.0835L13.8945 11.8328C13.747 14.0452 13.6733 15.1514 12.9524 15.8258C12.2316 16.5002 11.1229 16.5002 8.90559 16.5002H8.26113C6.04379 16.5002 4.93512 16.5002 4.21428 15.8258C3.49344 15.1514 3.41969 14.0452 3.2722 11.8328L2.88892 6.0835" stroke="#373737" stroke-width="1.25" stroke-linecap="round"/>
                          <path d="M4 4C4.04657 4 4.06985 4 4.09096 3.99947C4.77716 3.98208 5.38252 3.54576 5.61601 2.90027C5.6232 2.88041 5.63056 2.85832 5.64528 2.81415L5.72619 2.57143C5.79526 2.36423 5.82979 2.26063 5.8756 2.17267C6.05834 1.82173 6.39645 1.57803 6.78717 1.51564C6.88511 1.5 6.99431 1.5 7.21272 1.5H9.95395C10.1724 1.5 10.2816 1.5 10.3795 1.51564C10.7702 1.57803 11.1083 1.82173 11.2911 2.17267C11.3369 2.26063 11.3714 2.36423 11.4405 2.57143L11.5214 2.81415C11.5361 2.85826 11.5435 2.88042 11.5507 2.90027C11.7841 3.54576 12.3895 3.98208 13.0757 3.99947C13.0968 4 13.1201 4 13.1667 4" stroke="#373737" stroke-width="1.25"/>
</svg></span></p>
                    `;

                    // Create and append the dynamic link (separate from innerHTML)
                    const pageLinkWrapper = document.createElement('p');
                    pageLinkWrapper.appendChild(commentLink);
                    commentDiv.querySelector('.commPage').appendChild(pageLinkWrapper);

                    // Append the comment to the container
                    commentsContainer.appendChild(commentDiv);

                    // Delete comment
                    commentDiv.querySelector('.delete-icon').addEventListener('click', function () {
                        if (confirm('Are you sure you want to delete this comment?')) {
                            const updatedAnnotations = annotations.map(a => {
                                if (a.id === comment.id) {
                                    delete a.comment;
                                }
                                return a;
                            });
                            setCookie(cookieKey, JSON.stringify(updatedAnnotations), 7);
                            commentDiv.remove();
                            location.reload();
                        }
                    });

                    // Edit functionality
                    commentDiv.querySelector('.edit-icon').addEventListener('click', function () {
                    const editModal = document.getElementById('editModal');
                    const highlightedText = document.getElementById('highlightedText');
                    const editCommentText = document.getElementById('editCommentText');
                    const updateButton = document.getElementById('updateComment');
                    const cancelButton = document.getElementById('cancelEdit');

                    highlightedText.textContent = comment.selectedText;
                    editCommentText.value = comment.comment;

                    // Show the modal
                    editModal.classList.add('show');

                     updateButton.onclick = function () {
                    const updatedComment = editCommentText.value.trim();
                    if (updatedComment === '') {
                        alert('Comment cannot be empty.');
                        return;
                    }

                    const updatedAnnotations = annotations.map(a => {
                        if (a.id === comment.id) {
                            a.comment = updatedComment;
                        }
                        return a;
                    });

                    setCookie(cookieKey, JSON.stringify(updatedAnnotations), 7);
                    commentDiv.querySelector('.comment-content').textContent = updatedComment;
                    editModal.classList.remove('show');
                };

                        // Handle cancel
                        cancelButton.onclick = function () {
                        editModal.classList.remove('show');
                    };
                });
                });
            } else {
                // No comments available - show a "No data available" message
                const noDataMessage = document.createElement('div');
                noDataMessage.classList.add('toc-message');
                noDataMessage.textContent = 'Data not available';
                commentsContainer.appendChild(noDataMessage);
            }

            // Add event listener to the close button
            const closeBtn = document.getElementById('toc-close-btn');
            closeBtn.addEventListener('click', () => {
                commentsContainer.style.display = 'none'; // Hide the comments popup
            });
        });


// Function to handle comment updation
function updateComment(commentId, updatedText, commentDiv) {
    const cookieKey = `annotations_${currentUserId}_${currentBookId}`;
    const annotations = getAnnotationsFromCookie(cookieKey) || [];

    let updated = false;

    const updatedAnnotations = annotations.map(annotation => {
        if (annotation.id === commentId) {
            annotation.comment = updatedText;
            updated = true;
        }
        return annotation;
    });

    if (!updated) {
        alert('Comment ID not found in cookie.');
        return;
    }

    // Save back to cookie
    setCookie(cookieKey, JSON.stringify(updatedAnnotations), 7);

    // Update the comment text in the DOM
    const commentContentP = commentDiv.querySelector('.comment-content');
    commentContentP.textContent = updatedText;

    alert('Comment successfully updated!');
}



// Zoom In/Out functionality

const zoomInButton = document.getElementById('zoom-in');
const zoomOutButton = document.getElementById('zoom-out');

// Zoom In
zoomInButton.addEventListener('click', () => {
    zoomIn(); 
});

// Zoom Out
zoomOutButton.addEventListener('click', () => {
    zoomOut(); 
});

function zoomIn() {
    currentZoomLevel += 0.1; // Increase zoom level
    renderPage(currentPage); // Re-render the current page
}

function zoomOut() {
    currentZoomLevel = Math.max(0, currentZoomLevel - 0.1); // Decrease zoom level
    renderPage(currentPage); // Re-render the current page
}


 // Cancel button event 
document.addEventListener('click', function (event) {
    // Check if the clicked element has the class 'cancel-comment'
    if (event.target.classList.contains('cancel-comment')) {
        // Find the closest comment box and remove it
        const commentBox = event.target.closest('.comment-box');
        if (commentBox) {
            commentBox.remove();
        }
    }
});


document.getElementById("search-icon").addEventListener("click", function() {
    var searchPopup = document.getElementById("search-popup");
    if (searchPopup.style.display === "none" || searchPopup.style.display === "") {
        searchPopup.style.display = "block"; // Show the popup
    } else {
        searchPopup.style.display = "none"; // Hide the popup
        clearHighlights();
        resultsInfo.textContent = "";
        searchInput.value = "";
    }
});



function setCookie(name, value, days = 7) {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name) {
    return document.cookie.split('; ').reduce((r, v) => {
        const parts = v.split('=');
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;
    }, '');
}

function getAnnotationsFromCookie(key) {
    const raw = document.cookie
        .split('; ')
        .find(row => row.startsWith(key + '='));
    return raw ? JSON.parse(decodeURIComponent(raw.split('=')[1])) : [];
}



function createPaginationButtons(totalPages) {
    pageNumbersContainer.innerHTML = '';

    const sideButtons = 2; // How many before and after

    const createButton = (page) => {
        const btn = document.createElement('button');
        btn.textContent = page;
        btn.dataset.page = page;
        btn.addEventListener('click', () => {
            currentPage = page;
            renderPage(currentPage);
            highlightCurrentPageButton();
            createPaginationButtons(totalPages); // Re-render buttons
            updateButtonState();
        });
        if (page === currentPage) btn.classList.add('active');
        pageNumbersContainer.appendChild(btn);
    };

    const createEllipsis = () => {
        const span = document.createElement('span');
        span.textContent = '...';
        span.style.padding = '4px 10px';
        pageNumbersContainer.appendChild(span);
    };

    if (totalPages <= 5) {
        // Just show all pages
        for (let i = 1; i <= totalPages; i++) {
            createButton(i);
        }
    } else {
        // Always show first page
        createButton(1);

        if (currentPage > sideButtons + 2) {
            createEllipsis();
        }

        const startPage = Math.max(2, currentPage - sideButtons);
        const endPage = Math.min(totalPages - 1, currentPage + sideButtons);

        for (let i = startPage; i <= endPage; i++) {
            createButton(i);
        }

        if (currentPage < totalPages - (sideButtons + 1)) {
            createEllipsis();
        }

        // Always show last page
        createButton(totalPages);
    }
}


function highlightCurrentPageButton() {
    const buttons = pageNumbersContainer.querySelectorAll('button');
    buttons.forEach((btn) => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.page) === currentPage) {
            btn.classList.add('active');
        }
    });
}

function removeDuplicateAnnotations(highlightDiv) {
    const EPSILON = 1; // handle rounding

    const toNumber = val => parseFloat(val) || 0;
    const targetLeft = toNumber(highlightDiv.style.left);
    const targetTop = toNumber(highlightDiv.style.top);
    const targetWidth = toNumber(highlightDiv.style.width);
    const targetHeight = toNumber(highlightDiv.style.height);

    document.querySelectorAll('.annotation').forEach(el => {
        const elLeft = toNumber(el.style.left);
        const elTop = toNumber(el.style.top);
        const elWidth = toNumber(el.style.width);
        const elHeight = toNumber(el.style.height);

        const isSame =
            Math.abs(elLeft - targetLeft) < EPSILON &&
            Math.abs(elTop - targetTop) < EPSILON &&
            Math.abs(elWidth - targetWidth) < EPSILON &&
            Math.abs(elHeight - targetHeight) < EPSILON;

        if (isSame && el !== highlightDiv) {
            el.style.background = 'none';
        }
    });
}
