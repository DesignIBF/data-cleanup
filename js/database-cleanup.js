let allTerms = [];
let filteredTerms = [];
let completedTerms = new Set(); // Track completed items
let editedTerms = new Map(); // Track edited proposed terms
let editedCategories = new Map(); // Track edited categories (arrays of categories)
let firebaseInitialized = false;
let currentDatasetId = null; // Will be generated from JSON file hash
let selectedTerms = new Set(); // Track selected terms for bulk operations

// Load JSON data
async function loadData() {
  try {
    const response = await fetch("no_results_terms_clean.json");
    const jsonData = await response.json();

    allTerms = jsonData.map((item, index) => ({
      id: index + 1,
      term: item.term,
      count: item.count,
      issues: identifyIssues(item.term),
      category: categorizeIssue(item.term),
      suggestedFix: getSuggestedFix(item.term),
      proposedTerm: cleanTerm(item.term),
      priority: getPriority(item.count, item.term),
      isCompleted: false,
    }));

    // Initialize Firebase and load saved data
    currentDatasetId = generateDatasetId(jsonData);
    if (initializeFirebaseWithStatus()) {
      // Test connection first
      const connectionOk = await testFirebaseConnection();
      if (connectionOk) {
        await loadFromFirebase();
        setupRealtimeSync();
      }
    }

    updateStats();
    applyFilters();
  } catch (error) {
    console.error("Error loading data:", error);
    document.getElementById("resultsBody").innerHTML =
      '<tr><td colspan="9" class="no-results">Error loading data. Please ensure the JSON file is accessible.</td></tr>';
  }
}

function identifyIssues(term) {
  const issues = [];

  // Formatting issues
  if (term.includes('"') && !term.match(/^".*"$/)) {
    issues.push("Unmatched quotes");
  }
  if (term.includes("(") && !term.includes(")")) {
    issues.push("Unclosed parentheses");
  }
  if (term.includes("[") && !term.includes("]")) {
    issues.push("Unclosed brackets");
  }
  if (term.startsWith('"') && !term.endsWith('"')) {
    issues.push("Incomplete quotes");
  }

  // Spacing issues
  if (term.startsWith(" ") || term.endsWith(" ")) {
    issues.push("Leading/trailing spaces");
  }
  if (term.includes("  ")) {
    issues.push("Multiple consecutive spaces");
  }

  // Common typos
  const typoPatterns = [
    { pattern: /ranun[^c]/i, issue: "Ranunculus misspelling" },
    { pattern: /hydra[^n]/i, issue: "Hydrangea misspelling" },
    { pattern: /lisian[^t]/i, issue: "Lisianthus misspelling" },
    { pattern: /delphi?[^n]/i, issue: "Delphinium misspelling" },
    { pattern: /eucal[^y]/i, issue: "Eucalyptus misspelling" },
    { pattern: /alstro[^e]/i, issue: "Alstroemeria misspelling" },
    { pattern: /lavendar/i, issue: "Lavender misspelling" },
    { pattern: /lillies/i, issue: "Lilies misspelling" },
  ];

  typoPatterns.forEach(({ pattern, issue }) => {
    if (pattern.test(term)) {
      issues.push(issue);
    }
  });

  return issues;
}

function categorizeIssue(term) {
  const issues = identifyIssues(term);
  const cleanTerm = term.toLowerCase().trim();

  // Priority order for categorization
  if (
    issues.some(
      (i) =>
        i.includes("quotes") ||
        i.includes("parentheses") ||
        i.includes("brackets")
    )
  ) {
    return "formatting";
  }
  if (issues.some((i) => i.includes("Incomplete"))) {
    return "incomplete";
  }
  if (issues.some((i) => i.includes("misspelling"))) {
    return "typo";
  }
  if (issues.some((i) => i.includes("spaces"))) {
    return "spacing";
  }

  // New categories - auto-detection
  if (
    ["assorted", "mixed", "variety", "selection", "bundle", "pack"].some((p) =>
      cleanTerm.includes(p)
    )
  ) {
    return "missing-assortment";
  }

  if (
    ["best by", "bbd", "expir", "shelf life", "use by", "date"].some((p) =>
      cleanTerm.includes(p)
    ) ||
    /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cleanTerm)
  ) {
    return "bbd";
  }

  if (
    [
      "spring",
      "summer",
      "fall",
      "autumn",
      "winter",
      "seasonal",
      "christmas",
      "valentine",
      "easter",
      "halloween",
      "holiday",
    ].some((p) => cleanTerm.includes(p))
  ) {
    return "seasonal";
  }

  if (
    [
      "out of stock",
      "discontinued",
      "unavailable",
      "not available",
      "sold out",
      "no longer",
      "retired",
    ].some((p) => cleanTerm.includes(p))
  ) {
    return "not-available";
  }

  // Existing synonym detection
  if (
    ["butterfly", "wildflowers", "tropicals", "greenery"].some((p) =>
      cleanTerm.includes(p)
    )
  ) {
    return "synonym";
  }

  if (["moab", "kiera", "cremone", "ofea"].some((p) => cleanTerm.includes(p))) {
    return "unknown";
  }

  return "typo"; // Default
}

function getSuggestedFix(term) {
  const issues = identifyIssues(term);

  if (issues.length > 0) {
    if (issues.some((i) => i.includes("quotes"))) {
      return "Remove quotes or properly close them";
    }
    if (issues.some((i) => i.includes("parentheses"))) {
      return "Add missing closing parenthesis";
    }
    if (issues.some((i) => i.includes("spaces"))) {
      return "Trim whitespace and normalize spacing";
    }
    if (issues.some((i) => i.includes("Ranunculus"))) {
      return 'Correct spelling to "ranunculus"';
    }
    if (issues.some((i) => i.includes("Hydrangea"))) {
      return 'Correct spelling to "hydrangea"';
    }
    if (issues.some((i) => i.includes("Lisianthus"))) {
      return 'Correct spelling to "lisianthus"';
    }
    if (issues.some((i) => i.includes("misspelling"))) {
      return "Fix spelling error";
    }
  }

  const category = categorizeIssue(term);
  switch (category) {
    case "synonym":
      return "Create synonym mapping or redirect";
    case "unknown":
      return "Investigate term - may need removal";
    default:
      return "Review and correct as needed";
  }
}

function cleanTerm(term) {
  let cleaned = term.trim();

  // Remove problematic quotes
  cleaned = cleaned.replace(/^"+|"+$/g, "");

  // Normalize spaces
  cleaned = cleaned.replace(/\s+/g, " ");

  // Fix common typos
  cleaned = cleaned.replace(/ranun[^c]/gi, "ranunculus");
  cleaned = cleaned.replace(/hydra[^n]/gi, "hydrangea");
  cleaned = cleaned.replace(/lisian[^t]/gi, "lisianthus");
  cleaned = cleaned.replace(/lavendar/gi, "lavender");
  cleaned = cleaned.replace(/lillies/gi, "lilies");
  cleaned = cleaned.replace(/alstro[^e]/gi, "alstroemeria");

  return cleaned.trim();
}

function getPriority(count, term) {
  const issues = identifyIssues(term);

  if (count >= 20) return "critical";
  if (count >= 10) return "high";
  if (issues.length > 1) return "high";
  if (count >= 5) return "medium";
  return "low";
}

function updateStats() {
  const totalErrors = allTerms.filter((t) => {
    const currentCategories = editedCategories.get(t.id) || [t.category];
    return currentCategories.some((cat) =>
      ["formatting", "incomplete", "typo", "spacing", "synonym"].includes(cat)
    );
  }).length;

  const missingPortfolio = allTerms.filter((t) => {
    const currentCategories = editedCategories.get(t.id) || [t.category];
    return currentCategories.some((cat) =>
      ["missing-assortment", "bbd"].includes(cat)
    );
  }).length;

  const seasonalAvailability = allTerms.filter((t) => {
    const currentCategories = editedCategories.get(t.id) || [t.category];
    return currentCategories.some((cat) =>
      ["seasonal", "not-available"].includes(cat)
    );
  }).length;

  const completedCount = completedTerms.size;
  const progressPercent =
    allTerms.length > 0
      ? Math.round((completedCount / allTerms.length) * 100)
      : 0;

  // Update stats with null checks
  const totalTermsEl = document.getElementById("totalTerms");
  if (totalTermsEl) totalTermsEl.textContent = allTerms.length;

  const totalErrorsEl = document.getElementById("totalErrors");
  if (totalErrorsEl) totalErrorsEl.textContent = totalErrors;

  const missingPortfolioEl = document.getElementById("missingPortfolio");
  if (missingPortfolioEl) missingPortfolioEl.textContent = missingPortfolio;

  const seasonalAvailabilityEl = document.getElementById(
    "seasonalAvailability"
  );
  if (seasonalAvailabilityEl)
    seasonalAvailabilityEl.textContent = seasonalAvailability;

  const totalImpactEl = document.getElementById("totalImpact");
  if (totalImpactEl)
    totalImpactEl.textContent = allTerms.reduce(
      (sum, term) => sum + term.count,
      0
    );

  const completedCountEl = document.getElementById("completedCount");
  if (completedCountEl) completedCountEl.textContent = completedCount;

  const progressTextEl = document.getElementById("progressText");
  if (progressTextEl)
    progressTextEl.textContent = `${progressPercent}% Complete`;

  const progressFillEl = document.getElementById("progressFill");
  if (progressFillEl) progressFillEl.style.width = `${progressPercent}%`;

  // Log analytics to console
  if (allTerms.length > 0) {
    logCategoryAnalytics();
  }
}

function applyFilters() {
  const searchTerm = document
    .getElementById("searchFilter")
    .value.toLowerCase();
  const impactFilter = document.getElementById("impactFilter").value;
  const categoryFilter = document.querySelector(".category-btn.active").dataset
    .category;

  filteredTerms = allTerms.filter((term) => {
    const currentCategories = editedCategories.get(term.id) || [term.category];
    const matchesSearch =
      !searchTerm || term.term.toLowerCase().includes(searchTerm);
    const matchesImpact = !impactFilter || term.priority === impactFilter;
    const matchesCategory =
      !categoryFilter || currentCategories.includes(categoryFilter);

    return matchesSearch && matchesImpact && matchesCategory;
  });

  // Sort results
  const sortBy = document.getElementById("sortFilter").value;
  filteredTerms.sort((a, b) => {
    switch (sortBy) {
      case "impact":
        return b.count - a.count;
      case "alphabetical":
        return a.term.localeCompare(b.term);
      case "category":
        return a.category.localeCompare(b.category) || b.count - a.count;
      default:
        return b.count - a.count;
    }
  });

  renderResults();
}

function renderResults() {
  const tbody = document.getElementById("resultsBody");
  const resultsCount = document.getElementById("resultsCount");

  if (!tbody) {
    console.error("resultsBody element not found");
    return;
  }

  if (resultsCount) {
    resultsCount.textContent = `Showing ${filteredTerms.length} of ${allTerms.length} individual database entries`;
  }

  if (filteredTerms.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="10" class="no-results">No terms match your current filters</td></tr>';
    return;
  }

  tbody.innerHTML = filteredTerms
    .map((term, index) => {
      const highlightedTerm = highlightIssues(term.term);
      const priorityClass = `impact-${term.priority}`;
      const isCompleted = completedTerms.has(term.id);
      const currentProposedTerm = editedTerms.get(term.id) || term.proposedTerm;
      const needsCleaning = term.term !== currentProposedTerm;
      const rowClass = isCompleted ? "fixed-row" : "";

      const isSelected = selectedTerms.has(term.id);
      const combinedRowClass = `${rowClass} ${isSelected ? "selected" : ""}`;

      return `
            <tr class="${combinedRowClass}" data-term-id="${term.id}">
                <td style="text-align: center;">
                    <input type="checkbox" class="row-select-checkbox" 
                           data-term-id="${term.id}" 
                           ${isSelected ? "checked" : ""}>
                </td>
                <td style="text-align: center;">
                    <input type="checkbox" class="fix-checkbox" 
                           data-term-id="${term.id}" 
                           ${isCompleted ? "checked" : ""}>
                </td>
                <td class="row-number">${index + 1}</td>
                <td class="term-cell">${highlightedTerm}</td>
                <td class="${priorityClass}">${term.count}</td>
                <td>
                    <div class="category-container">
                        ${renderCategoryTags(term)}
                        <span class="add-category-btn" data-term-id="${
                          term.id
                        }">+</span>
                    </div>
                </td>
                <td style="font-size: 12px;">
                    ${
                      term.issues.length > 0
                        ? term.issues.map((issue) => `• ${issue}`).join("<br>")
                        : "No specific issues detected"
                    }
                </td>
                <td style="font-size: 12px;">${escapeHtml(
                  term.suggestedFix
                )}</td>
                <td class="term-cell">
                    <div class="editable-term ${
                      needsCleaning ? "proposed-fix" : "no-change"
                    }" 
                         data-term-id="${term.id}" 
                         data-original="${escapeHtml(term.proposedTerm)}"
                         contenteditable="false">
                        ${
                          needsCleaning
                            ? escapeHtml(currentProposedTerm)
                            : "No change needed"
                        }
                        <span class="edit-indicator">✏️</span>
                    </div>
                </td>
                <td class="${priorityClass}">${term.priority.toUpperCase()}</td>
            </tr>
        `;
    })
    .join("");
}

function highlightIssues(term) {
  let highlighted = escapeHtml(term);

  // Highlight problematic characters
  highlighted = highlighted.replace(
    /"/g,
    '<span class="issue-highlight">"</span>'
  );
  highlighted = highlighted.replace(
    /\(/g,
    '<span class="issue-highlight">(</span>'
  );
  highlighted = highlighted.replace(
    /\[/g,
    '<span class="issue-highlight">[</span>'
  );

  return highlighted;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function exportCleanupReport() {
  const csvContent = [
    [
      "ID",
      "Fixed",
      "Current Database Term",
      "Failed Searches",
      "Issue Type",
      "Specific Problems",
      "Recommended Action",
      "Proposed Corrected Term",
      "Priority",
    ],
    ...filteredTerms.map((term, index) => [
      index + 1,
      completedTerms.has(term.id) ? "Yes" : "No",
      term.term,
      term.count,
      (editedCategories.get(term.id) || [term.category])
        .map(formatCategoryName)
        .join(", "),
      term.issues.join("; "),
      term.suggestedFix,
      editedTerms.get(term.id) || term.proposedTerm,
      term.priority.toUpperCase(),
    ]),
  ]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  downloadFile(csvContent, "database_cleanup_report.csv", "text/csv");
}

function exportSQLScript() {
  const termsToFix = filteredTerms.filter((term) => {
    const currentProposedTerm = editedTerms.get(term.id) || term.proposedTerm;
    return term.term !== currentProposedTerm;
  });

  const sqlStatements = termsToFix
    .map((term) => {
      const currentProposedTerm = editedTerms.get(term.id) || term.proposedTerm;
      const isCompleted = completedTerms.has(term.id) ? " -- COMPLETED" : "";
      return `-- Fix: ${term.term} -> ${currentProposedTerm} (${
        term.count
      } failed searches)${isCompleted}\nUPDATE search_terms SET term = '${currentProposedTerm.replace(
        /'/g,
        "''"
      )}' WHERE term = '${term.term.replace(/'/g, "''")}';`;
    })
    .join("\n\n");

  const completedCount = termsToFix.filter((term) =>
    completedTerms.has(term.id)
  ).length;
  const sqlContent = `-- Database Cleanup Script\n-- Generated: ${new Date().toISOString()}\n-- Total terms to fix: ${
    termsToFix.length
  }\n-- Completed: ${completedCount}\n-- Remaining: ${
    termsToFix.length - completedCount
  }\n\n${sqlStatements}`;

  downloadFile(sqlContent, "search_terms_cleanup.sql", "text/sql");
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type: type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Event listeners
document.addEventListener("DOMContentLoaded", function () {
  const searchFilter = document.getElementById("searchFilter");
  const impactFilter = document.getElementById("impactFilter");
  const sortFilter = document.getElementById("sortFilter");

  if (searchFilter) {
    searchFilter.addEventListener("input", applyFilters);
  }
  if (impactFilter) {
    impactFilter.addEventListener("change", applyFilters);
  }
  if (sortFilter) {
    sortFilter.addEventListener("change", applyFilters);
  }

  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document
        .querySelectorAll(".category-btn")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      applyFilters();
    });
  });

  // Setup checkbox event delegation
  document.addEventListener("change", function (event) {
    if (event.target.classList.contains("fix-checkbox")) {
      handleCheckboxChange(event);
    }
  });

  // Setup inline editing
  setupInlineEditing();

  // Setup category editing
  setupCategoryEditing();

  // Setup bulk operations
  setupBulkOperations();

  // Initialize
  loadData();
});
// Helper function to format category names for display
function formatCategoryName(category) {
  const categoryNames = {
    "missing-assortment": "Missing Assortment",
    bbd: "BBD",
    seasonal: "Seasonal",
    "not-available": "Not Available",
    typo: "Typos",
    synonym: "Synonyms",
    spacing: "Spacing",
    formatting: "Formatting",
    incomplete: "Incomplete",
    unknown: "Unknown",
  };
  return categoryNames[category] || category;
}

// Helper function to render category tags for a term
function renderCategoryTags(term) {
  const categories = editedCategories.get(term.id) || [term.category];
  return categories
    .map(
      (category) => `
    <span class="category-tag ${category} editable-category" 
          data-term-id="${term.id}" 
          data-category="${category}">
        ${formatCategoryName(category)}
        <span class="category-remove" data-term-id="${
          term.id
        }" data-category="${category}">×</span>
    </span>
  `
    )
    .join(" ");
}

// Handle checkbox changes
function handleCheckboxChange(event) {
  const termId = parseInt(event.target.dataset.termId);
  const isChecked = event.target.checked;

  if (isChecked) {
    completedTerms.add(termId);
  } else {
    completedTerms.delete(termId);
  }

  // Re-render to update row styling
  renderResults();

  // Save to Firebase
  debouncedSave();
}

// Handle inline editing
function setupInlineEditing() {
  document.addEventListener("click", function (event) {
    if (event.target.classList.contains("editable-term")) {
      startEditing(event.target);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && event.target.classList.contains("editing")) {
      event.preventDefault();
      finishEditing(event.target);
    }
    if (event.key === "Escape" && event.target.classList.contains("editing")) {
      cancelEditing(event.target);
    }
  });

  document.addEventListener(
    "blur",
    function (event) {
      if (event.target.classList.contains("editing")) {
        finishEditing(event.target);
      }
    },
    true
  );
}

function startEditing(element) {
  element.classList.add("editing");
  element.contentEditable = true;

  // Store the original HTML and get just the text content for editing
  const textContent = element.textContent.replace("✏️", "").trim();
  element.textContent = textContent;

  element.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function finishEditing(element) {
  const termId = parseInt(element.dataset.termId);
  const newValue = element.textContent.trim();

  element.classList.remove("editing");
  element.contentEditable = false;

  // Save the edited value
  editedTerms.set(termId, newValue);

  // Update the display - pencil will be hidden by CSS and show on hover
  element.innerHTML =
    escapeHtml(newValue) + '<span class="edit-indicator">✏️</span>';

  // Save to Firebase
  debouncedSave();
}

function cancelEditing(element) {
  const termId = parseInt(element.dataset.termId);
  const originalValue = editedTerms.get(termId) || element.dataset.original;

  element.classList.remove("editing");
  element.contentEditable = false;
  element.innerHTML =
    escapeHtml(originalValue) + '<span class="edit-indicator">✏️</span>';
}
// Category editing functionality
function setupCategoryEditing() {
  document.addEventListener("click", function (event) {
    // Handle adding new category
    if (event.target.classList.contains("add-category-btn")) {
      const termId = parseInt(event.target.dataset.termId);
      showCategoryDropdown(event.target, termId, "add");
      return;
    }

    // Handle removing category
    if (event.target.classList.contains("category-remove")) {
      const termId = parseInt(event.target.dataset.termId);
      const category = event.target.dataset.category;
      removeCategoryFromTerm(termId, category);
      return;
    }

    // Handle editing existing category
    if (event.target.classList.contains("editable-category")) {
      const termId = parseInt(event.target.dataset.termId);
      const currentCategory = event.target.dataset.category;
      showCategoryDropdown(event.target, termId, "edit", currentCategory);
      return;
    }

    // Close dropdown when clicking elsewhere
    if (!event.target.closest(".category-container")) {
      closeCategoryDropdowns();
    }
  });
}

function showCategoryDropdown(element, termId, mode, currentCategory = null) {
  // Close any existing dropdowns
  closeCategoryDropdowns();

  const container = element.closest(".category-container");
  const dropdown = createCategoryDropdown(termId, mode, currentCategory);
  container.appendChild(dropdown);
}

function createCategoryDropdown(termId, mode, currentCategory) {
  const dropdown = document.createElement("div");
  dropdown.className = "category-dropdown";

  const categories = [
    { id: "formatting", name: "Formatting", class: "formatting" },
    { id: "incomplete", name: "Incomplete", class: "incomplete" },
    { id: "typo", name: "Typos", class: "typo" },
    { id: "spacing", name: "Spacing", class: "spacing" },
    { id: "synonym", name: "Synonyms", class: "synonym" },
    {
      id: "missing-assortment",
      name: "Missing Assortment",
      class: "missing-assortment",
    },
    { id: "bbd", name: "BBD", class: "bbd" },
    { id: "seasonal", name: "Seasonal", class: "seasonal" },
    { id: "not-available", name: "Not Available", class: "not-available" },
    { id: "unknown", name: "Unknown", class: "unknown" },
  ];

  const existingCategories = editedCategories.get(termId) || [
    allTerms.find((t) => t.id === termId)?.category,
  ];
  const availableCategories = categories.filter(
    (cat) => !existingCategories.includes(cat.id)
  );

  const headerText = mode === "add" ? "Add Issue Type" : "Change Issue Type";

  dropdown.innerHTML = `
    <div class="category-dropdown-header">${headerText}</div>
    ${(mode === "add" ? availableCategories : categories)
      .map(
        (cat) => `
      <div class="category-option ${
        cat.id === currentCategory ? "current" : ""
      }" 
           data-category="${cat.id}"
           data-mode="${mode}">
        <span>${cat.name}</span>
        <span class="category-preview category-tag ${cat.class}">${
          cat.name
        }</span>
      </div>
    `
      )
      .join("")}
  `;

  // Add click handlers for options
  dropdown.addEventListener("click", function (event) {
    const option = event.target.closest(".category-option");
    if (option) {
      const newCategory = option.dataset.category;
      const optionMode = option.dataset.mode;

      if (optionMode === "add") {
        addCategoryToTerm(termId, newCategory);
      } else {
        replaceCategoryInTerm(termId, currentCategory, newCategory);
      }
      closeCategoryDropdowns();
    }
  });

  return dropdown;
}

function addCategoryToTerm(termId, newCategory) {
  const currentCategories = editedCategories.get(termId) || [
    allTerms.find((t) => t.id === termId)?.category,
  ];
  const updatedCategories = [...currentCategories, newCategory];
  editedCategories.set(termId, updatedCategories);

  updateStats();
  renderResults();
  debouncedSave();
}

function replaceCategoryInTerm(termId, oldCategory, newCategory) {
  const currentCategories = editedCategories.get(termId) || [
    allTerms.find((t) => t.id === termId)?.category,
  ];
  const updatedCategories = currentCategories.map((cat) =>
    cat === oldCategory ? newCategory : cat
  );
  editedCategories.set(termId, updatedCategories);

  updateStats();
  renderResults();
  debouncedSave();
}

function removeCategoryFromTerm(termId, categoryToRemove) {
  const currentCategories = editedCategories.get(termId) || [
    allTerms.find((t) => t.id === termId)?.category,
  ];
  const updatedCategories = currentCategories.filter(
    (cat) => cat !== categoryToRemove
  );

  // Don't allow removing all categories - keep at least one
  if (updatedCategories.length === 0) {
    updatedCategories.push("unknown");
  }

  editedCategories.set(termId, updatedCategories);

  updateStats();
  renderResults();
  debouncedSave();
}

function closeCategoryDropdowns() {
  document.querySelectorAll(".category-dropdown").forEach((dropdown) => {
    dropdown.remove();
  });
}
// Firebase Integration Functions
function initializeFirebase() {
  if (typeof window.firebaseDB === "undefined") {
    console.warn(
      "Firebase not available. Data will not persist across sessions."
    );
    return false;
  }
  firebaseInitialized = true;
  return true;
}

function generateDatasetId(jsonData) {
  // Create a simple hash from the JSON data to identify this dataset
  const dataString = JSON.stringify(jsonData.slice(0, 10)); // Use first 10 items for hash
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `dataset_${Math.abs(hash)}`;
}

async function loadFromFirebase() {
  if (!firebaseInitialized || !currentDatasetId) return;

  try {
    const docRef = window.firebaseDoc(
      window.firebaseDB,
      "cleanup-data",
      currentDatasetId
    );
    const docSnap = await window.firebaseGetDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();

      // Load completed terms
      if (data.completedTerms) {
        completedTerms = new Set(data.completedTerms);
      }

      // Load edited terms
      if (data.editedTerms) {
        editedTerms = new Map(
          Object.entries(data.editedTerms).map(([k, v]) => [parseInt(k), v])
        );
      }

      // Load edited categories
      if (data.editedCategories) {
        editedCategories = new Map(
          Object.entries(data.editedCategories).map(([k, v]) => [
            parseInt(k),
            v,
          ])
        );
      }

      console.log("Data loaded from Firebase");
      updateStats();
      renderResults();
    }
  } catch (error) {
    console.error("Error loading from Firebase:", error);
  }
}

async function saveToFirebase() {
  if (!firebaseInitialized || !currentDatasetId) return;

  try {
    const docRef = window.firebaseDoc(
      window.firebaseDB,
      "cleanup-data",
      currentDatasetId
    );

    const dataToSave = {
      completedTerms: Array.from(completedTerms),
      editedTerms: Object.fromEntries(editedTerms),
      editedCategories: Object.fromEntries(editedCategories),
      lastUpdated: new Date().toISOString(),
      datasetId: currentDatasetId,
    };

    await window.firebaseSetDoc(docRef, dataToSave, { merge: true });
    console.log("Data saved to Firebase");
  } catch (error) {
    console.error("Error saving to Firebase:", error);
  }
}

// Debounced save function to avoid too many Firebase writes
let saveTimeout;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveToFirebase, 1000); // Save after 1 second of inactivity
}

// Setup real-time sync
function setupRealtimeSync() {
  if (!firebaseInitialized || !currentDatasetId) return;

  const docRef = window.firebaseDoc(
    window.firebaseDB,
    "cleanup-data",
    currentDatasetId
  );

  window.firebaseOnSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();

      // Only update if the data is newer than our last update
      if (
        data.lastUpdated &&
        data.lastUpdated !== localStorage.getItem("lastFirebaseUpdate")
      ) {
        localStorage.setItem("lastFirebaseUpdate", data.lastUpdated);

        // Update local data
        if (data.completedTerms) {
          completedTerms = new Set(data.completedTerms);
        }
        if (data.editedTerms) {
          editedTerms = new Map(
            Object.entries(data.editedTerms).map(([k, v]) => [parseInt(k), v])
          );
        }
        if (data.editedCategories) {
          editedCategories = new Map(
            Object.entries(data.editedCategories).map(([k, v]) => [
              parseInt(k),
              v,
            ])
          );
        }

        updateStats();
        renderResults();
        console.log("Data synced from Firebase");
      }
    }
  });
}
// Firebase status functions
function updateFirebaseStatus(status, message) {
  const indicator = document.getElementById("statusIndicator");
  const text = document.getElementById("statusText");

  if (indicator && text) {
    indicator.className = `status-indicator ${status}`;
    text.textContent = message;
  }
}

// Update the initializeFirebase function to show status
function initializeFirebaseWithStatus() {
  updateFirebaseStatus("checking", "Connecting to Firebase...");

  if (typeof window.firebaseDB === "undefined") {
    updateFirebaseStatus(
      "disconnected",
      "Firebase not configured - data will not persist"
    );
    console.warn(
      "Firebase not available. Data will not persist across sessions."
    );
    return false;
  }

  firebaseInitialized = true;
  updateFirebaseStatus(
    "connected",
    "Firebase connected - testing permissions..."
  );
  return true;
}
// Test Firebase connection
async function testFirebaseConnection() {
  if (!firebaseInitialized) return false;

  try {
    // Try to write a test document
    const testDocRef = window.firebaseDoc(
      window.firebaseDB,
      "test",
      "connection"
    );
    await window.firebaseSetDoc(testDocRef, {
      timestamp: new Date().toISOString(),
      test: true,
    });

    console.log("Firebase connection test successful");
    updateFirebaseStatus("connected", "Firebase connected - data will sync");
    return true;
  } catch (error) {
    console.error("Firebase connection test failed:", error);

    if (error.code === "permission-denied") {
      updateFirebaseStatus(
        "disconnected",
        "Firebase permissions needed - update security rules"
      );
      console.warn(
        "Firebase permissions denied. Please update Firestore security rules."
      );
    } else {
      updateFirebaseStatus(
        "disconnected",
        "Firebase connection failed - check console"
      );
    }
    return false;
  }
}
// Bulk operations functionality
function updateBulkActionsVisibility() {
  const bulkActions = document.getElementById("bulkActions");
  const bulkCount = document.getElementById("bulkCount");

  if (selectedTerms.size > 0) {
    bulkActions.style.display = "flex";
    bulkCount.textContent = `${selectedTerms.size} selected`;
  } else {
    bulkActions.style.display = "none";
  }
}

function toggleTermSelection(termId, isSelected) {
  if (isSelected) {
    selectedTerms.add(termId);
  } else {
    selectedTerms.delete(termId);
  }
  updateBulkActionsVisibility();
  // Only update the specific row styling instead of full re-render
  updateRowSelection(termId, isSelected);
}

function updateRowSelection(termId, isSelected) {
  const row = document.querySelector(`tr[data-term-id="${termId}"]`);
  if (row) {
    if (isSelected) {
      row.classList.add("selected");
    } else {
      row.classList.remove("selected");
    }
  }
}

function selectAllTerms(selectAll) {
  if (selectAll) {
    filteredTerms.forEach((term) => selectedTerms.add(term.id));
  } else {
    selectedTerms.clear();
  }
  updateBulkActionsVisibility();

  // Update all visible checkboxes and row styling without full re-render
  document.querySelectorAll(".row-select-checkbox").forEach((checkbox) => {
    const termId = parseInt(checkbox.dataset.termId);
    checkbox.checked = selectAll;
    updateRowSelection(termId, selectAll);
  });
}

function clearSelection() {
  selectedTerms.clear();
  const selectAllCheckbox = document.getElementById("selectAll");
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
  }
  updateBulkActionsVisibility();
  renderResults();
}

function bulkMarkComplete() {
  selectedTerms.forEach((termId) => {
    completedTerms.add(termId);
  });

  // Keep selection after applying changes
  updateStats();
  renderResults();
  debouncedSave();
}

function showBulkCategoryMenu() {
  const bulkActions = document.getElementById("bulkActions");

  // Remove existing dropdown
  const existingDropdown = document.querySelector(".bulk-category-dropdown");
  if (existingDropdown) {
    existingDropdown.remove();
    return;
  }

  const dropdown = createBulkCategoryDropdown();
  bulkActions.style.position = "relative";
  bulkActions.appendChild(dropdown);
}

function createBulkCategoryDropdown() {
  const dropdown = document.createElement("div");
  dropdown.className = "bulk-category-dropdown";

  const categories = [
    { id: "formatting", name: "Formatting", class: "formatting" },
    { id: "incomplete", name: "Incomplete", class: "incomplete" },
    { id: "typo", name: "Typos", class: "typo" },
    { id: "spacing", name: "Spacing", class: "spacing" },
    { id: "synonym", name: "Synonyms", class: "synonym" },
    {
      id: "missing-assortment",
      name: "Missing Assortment",
      class: "missing-assortment",
    },
    { id: "bbd", name: "BBD", class: "bbd" },
    { id: "seasonal", name: "Seasonal", class: "seasonal" },
    { id: "not-available", name: "Not Available", class: "not-available" },
    { id: "unknown", name: "Unknown", class: "unknown" },
  ];

  dropdown.innerHTML = `
    <div class="category-dropdown-header">Category Actions for ${
      selectedTerms.size
    } items</div>
    <div class="category-action-section">
      <div class="category-action-header">Add Category</div>
      ${categories
        .map(
          (cat) => `
        <div class="category-option" data-category="${cat.id}" data-action="add">
          <span>+ ${cat.name}</span>
          <span class="category-preview category-tag ${cat.class}">${cat.name}</span>
        </div>
      `
        )
        .join("")}
    </div>
    <div class="category-action-section">
      <div class="category-action-header">Replace All Categories</div>
      ${categories
        .map(
          (cat) => `
        <div class="category-option" data-category="${cat.id}" data-action="replace">
          <span>→ ${cat.name}</span>
          <span class="category-preview category-tag ${cat.class}">${cat.name}</span>
        </div>
      `
        )
        .join("")}
    </div>
    <div class="category-action-section">
      <div class="category-action-header">Remove Category</div>
      ${categories
        .map(
          (cat) => `
        <div class="category-option" data-category="${cat.id}" data-action="remove">
          <span>− ${cat.name}</span>
          <span class="category-preview category-tag ${cat.class}">${cat.name}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  dropdown.addEventListener("click", function (event) {
    const option = event.target.closest(".category-option");
    if (option) {
      const category = option.dataset.category;
      const action = option.dataset.action;
      applyBulkCategory(category, action);
      dropdown.remove();
    }
  });

  return dropdown;
}

function applyBulkCategory(category, action = "add") {
  selectedTerms.forEach((termId) => {
    const currentCategories = editedCategories.get(termId) || [
      allTerms.find((t) => t.id === termId)?.category,
    ];
    let updatedCategories = [...currentCategories];

    switch (action) {
      case "add":
        if (!updatedCategories.includes(category)) {
          updatedCategories.push(category);
        }
        break;
      case "remove":
        updatedCategories = updatedCategories.filter((cat) => cat !== category);
        // Don't allow removing all categories
        if (updatedCategories.length === 0) {
          updatedCategories = ["unknown"];
        }
        break;
      case "replace":
        updatedCategories = [category];
        break;
    }

    editedCategories.set(termId, updatedCategories);
  });

  // Keep selection after applying changes
  updateStats();
  renderResults();
  debouncedSave();
}

// Setup bulk operations event listeners
function setupBulkOperations() {
  // Select all checkbox
  const selectAllCheckbox = document.getElementById("selectAll");
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", function (event) {
      selectAllTerms(event.target.checked);
    });
  } else {
    console.warn(
      "selectAll checkbox not found - bulk operations may not work properly"
    );
  }

  // Row selection checkboxes (delegated event handling)
  document.addEventListener("change", function (event) {
    if (event.target.classList.contains("row-select-checkbox")) {
      const termId = parseInt(event.target.dataset.termId);
      toggleTermSelection(termId, event.target.checked);
    }
  });

  // Close bulk dropdowns when clicking elsewhere
  document.addEventListener("click", function (event) {
    if (!event.target.closest(".bulk-actions")) {
      const dropdown = document.querySelector(".bulk-category-dropdown");
      if (dropdown) {
        dropdown.remove();
      }
      const editor = document.querySelector(".bulk-term-editor");
      if (editor) {
        editor.remove();
      }
    }
  });
}
// Simple analytics function
function logCategoryAnalytics() {
  const categoryStats = {};

  allTerms.forEach((term) => {
    const categories = editedCategories.get(term.id) || [term.category];
    categories.forEach((category) => {
      categoryStats[category] = (categoryStats[category] || 0) + 1;
    });
  });

  console.log("📊 Category Distribution:", categoryStats);
  console.log(
    "✅ Completion Rate:",
    `${completedTerms.size}/${allTerms.length} (${Math.round(
      (completedTerms.size / allTerms.length) * 100
    )}%)`
  );
}
// Bulk term editing functionality
function showBulkTermEditor() {
  const bulkActions = document.getElementById("bulkActions");

  // Remove existing editor
  const existingEditor = document.querySelector(".bulk-term-editor");
  if (existingEditor) {
    existingEditor.remove();
    return;
  }

  const editor = createBulkTermEditor();
  bulkActions.style.position = "relative";
  bulkActions.appendChild(editor);
}

function createBulkTermEditor() {
  const editor = document.createElement("div");
  editor.className = "bulk-term-editor";

  editor.innerHTML = `
    <div class="bulk-editor-header">Edit ${selectedTerms.size} Proposed Terms</div>
    <div class="bulk-editor-content">
      <div class="bulk-editor-options">
        <label>
          <input type="radio" name="bulkEditMode" value="replace" checked>
          Replace all with:
        </label>
        <input type="text" id="bulkReplaceText" placeholder="Enter replacement text">
      </div>
      <div class="bulk-editor-options">
        <label>
          <input type="radio" name="bulkEditMode" value="prefix">
          Add prefix:
        </label>
        <input type="text" id="bulkPrefixText" placeholder="Text to add at beginning">
      </div>
      <div class="bulk-editor-options">
        <label>
          <input type="radio" name="bulkEditMode" value="suffix">
          Add suffix:
        </label>
        <input type="text" id="bulkSuffixText" placeholder="Text to add at end">
      </div>
      <div class="bulk-editor-options">
        <label>
          <input type="radio" name="bulkEditMode" value="find-replace">
          Find & Replace:
        </label>
        <input type="text" id="bulkFindText" placeholder="Find">
        <input type="text" id="bulkReplaceWithText" placeholder="Replace with">
      </div>
      <div class="bulk-editor-actions">
        <button class="bulk-editor-btn apply" onclick="applyBulkTermEdit()">Apply</button>
        <button class="bulk-editor-btn cancel" onclick="closeBulkTermEditor()">Cancel</button>
      </div>
    </div>
  `;

  return editor;
}

function applyBulkTermEdit() {
  const mode = document.querySelector(
    'input[name="bulkEditMode"]:checked'
  ).value;

  selectedTerms.forEach((termId) => {
    const currentTerm =
      editedTerms.get(termId) ||
      allTerms.find((t) => t.id === termId)?.proposedTerm ||
      "";
    let newTerm = currentTerm;

    switch (mode) {
      case "replace":
        const replaceText = document
          .getElementById("bulkReplaceText")
          .value.trim();
        if (replaceText) {
          newTerm = replaceText;
        }
        break;

      case "prefix":
        const prefixText = document
          .getElementById("bulkPrefixText")
          .value.trim();
        if (prefixText) {
          newTerm = prefixText + currentTerm;
        }
        break;

      case "suffix":
        const suffixText = document
          .getElementById("bulkSuffixText")
          .value.trim();
        if (suffixText) {
          newTerm = currentTerm + suffixText;
        }
        break;

      case "find-replace":
        const findText = document.getElementById("bulkFindText").value;
        const replaceWithText = document.getElementById(
          "bulkReplaceWithText"
        ).value;
        if (findText) {
          newTerm = currentTerm.replace(
            new RegExp(findText, "g"),
            replaceWithText
          );
        }
        break;
    }

    if (newTerm !== currentTerm) {
      editedTerms.set(termId, newTerm);
    }
  });

  closeBulkTermEditor();
  // Keep selection after applying changes
  renderResults();
  debouncedSave();
}

function closeBulkTermEditor() {
  const editor = document.querySelector(".bulk-term-editor");
  if (editor) {
    editor.remove();
  }
}
// Bulk operations functionality
function updateBulkActionsVisibility() {
  const bulkActions = document.getElementById("bulkActions");
  const bulkCount = document.getElementById("bulkCount");

  if (bulkActions && bulkCount) {
    if (selectedTerms.size > 0) {
      bulkActions.style.display = "flex";
      bulkCount.textContent = `${selectedTerms.size} selected`;
    } else {
      bulkActions.style.display = "none";
    }
  }
}

function toggleTermSelection(termId, isSelected) {
  if (isSelected) {
    selectedTerms.add(termId);
  } else {
    selectedTerms.delete(termId);
  }
  updateBulkActionsVisibility();
  // Only update the specific row styling instead of full re-render
  updateRowSelection(termId, isSelected);
}

function updateRowSelection(termId, isSelected) {
  const row = document.querySelector(`tr[data-term-id="${termId}"]`);
  if (row) {
    if (isSelected) {
      row.classList.add("selected");
    } else {
      row.classList.remove("selected");
    }
  }
}

function selectAllTerms(selectAll) {
  if (selectAll) {
    filteredTerms.forEach((term) => selectedTerms.add(term.id));
  } else {
    selectedTerms.clear();
  }
  updateBulkActionsVisibility();

  // Update all visible checkboxes and row styling without full re-render
  document.querySelectorAll(".row-select-checkbox").forEach((checkbox) => {
    const termId = parseInt(checkbox.dataset.termId);
    checkbox.checked = selectAll;
    updateRowSelection(termId, selectAll);
  });
}

function clearSelection() {
  selectedTerms.clear();
  const selectAllCheckbox = document.getElementById("selectAll");
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
  }
  updateBulkActionsVisibility();
  renderResults();
}

function bulkMarkComplete() {
  selectedTerms.forEach((termId) => {
    completedTerms.add(termId);
  });

  // Keep selection after applying changes
  updateStats();
  renderResults();
  debouncedSave();
}
// Export functions
function exportCleanupReport() {
  const csvContent = [
    [
      "ID",
      "Fixed",
      "Current Database Term",
      "Failed Searches",
      "Issue Type",
      "Specific Problems",
      "Recommended Action",
      "Proposed Corrected Term",
      "Priority",
    ],
    ...allTerms.map((term, index) => {
      const isCompleted = completedTerms.has(term.id);
      const currentCategories = editedCategories.get(term.id) || [
        term.category,
      ];
      const currentProposedTerm = editedTerms.get(term.id) || term.proposedTerm;

      // Leave empty if no change needed or if it's the same as original
      let proposedTermForExport = "";
      if (
        currentProposedTerm &&
        currentProposedTerm !== "No change needed" &&
        currentProposedTerm !== term.term
      ) {
        proposedTermForExport = currentProposedTerm;
      }

      return [
        term.id,
        isCompleted ? "Yes" : "No",
        term.term,
        term.count,
        currentCategories.map(formatCategoryName).join(", "),
        term.issues.join("; "),
        term.suggestedFix,
        proposedTermForExport,
        term.priority.toUpperCase(),
      ];
    }),
  ]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  downloadFile(csvContent, "database_cleanup_report.csv", "text/csv");
}

function exportSQLScript() {
  const termsToFix = allTerms.filter((term) => {
    const currentProposedTerm = editedTerms.get(term.id) || term.proposedTerm;
    return (
      term.term !== currentProposedTerm &&
      currentProposedTerm !== "No change needed"
    );
  });

  const sqlStatements = termsToFix
    .map((term) => {
      const currentProposedTerm = editedTerms.get(term.id) || term.proposedTerm;
      const isCompleted = completedTerms.has(term.id) ? " -- COMPLETED" : "";
      return `-- Fix: ${term.term} -> ${currentProposedTerm} (${
        term.count
      } failed searches)${isCompleted}\nUPDATE search_terms SET term = '${currentProposedTerm.replace(
        /'/g,
        "''"
      )}' WHERE term = '${term.term.replace(/'/g, "''")}';`;
    })
    .join("\n\n");

  const completedCount = termsToFix.filter((term) =>
    completedTerms.has(term.id)
  ).length;
  const sqlContent = `-- Database Cleanup Script\n-- Generated: ${new Date().toISOString()}\n-- Total terms to fix: ${
    termsToFix.length
  }\n-- Completed: ${completedCount}\n-- Remaining: ${
    termsToFix.length - completedCount
  }\n\n${sqlStatements}`;

  downloadFile(sqlContent, "search_terms_cleanup.sql", "text/sql");
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type: type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
