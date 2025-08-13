let allTerms = [];
let filteredTerms = [];

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
    }));

    updateStats();
    applyFilters();
  } catch (error) {
    console.error("Error loading data:", error);
    document.getElementById("resultsBody").innerHTML =
      '<tr><td colspan="8" class="no-results">Error loading data. Please ensure the JSON file is accessible.</td></tr>';
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

  // Additional categorization
  const cleanTerm = term.toLowerCase().trim();

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
  document.getElementById("totalTerms").textContent = allTerms.length;
  document.getElementById("totalProblems").textContent = allTerms.length;
  document.getElementById("criticalIssues").textContent = allTerms.filter(
    (t) => t.priority === "critical"
  ).length;
  document.getElementById("formattingIssues").textContent = allTerms.filter(
    (t) => t.category === "formatting" || t.category === "incomplete"
  ).length;
  document.getElementById("totalImpact").textContent = allTerms.reduce(
    (sum, term) => sum + term.count,
    0
  );
}

function applyFilters() {
  const searchTerm = document
    .getElementById("searchFilter")
    .value.toLowerCase();
  const impactFilter = document.getElementById("impactFilter").value;
  const categoryFilter = document.querySelector(".category-btn.active").dataset
    .category;

  filteredTerms = allTerms.filter((term) => {
    const matchesSearch =
      !searchTerm || term.term.toLowerCase().includes(searchTerm);
    const matchesImpact = !impactFilter || term.priority === impactFilter;
    const matchesCategory = !categoryFilter || term.category === categoryFilter;

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
  document.getElementById(
    "resultsCount"
  ).textContent = `Showing ${filteredTerms.length} of ${allTerms.length} individual database entries`;

  if (filteredTerms.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="no-results">No terms match your current filters</td></tr>';
    return;
  }

  tbody.innerHTML = filteredTerms
    .map((term, index) => {
      const highlightedTerm = highlightIssues(term.term);
      const priorityClass = `impact-${term.priority}`;
      const needsCleaning = term.term !== term.proposedTerm;

      return `
            <tr>
                <td class="row-number">${index + 1}</td>
                <td class="term-cell">${highlightedTerm}</td>
                <td class="${priorityClass}">${term.count}</td>
                <td><span class="category-tag ${term.category}">${
        term.category
      }</span></td>
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
                <td class="term-cell ${
                  needsCleaning ? "proposed-fix" : "no-change"
                }">
                    ${needsCleaning ? term.proposedTerm : "No change needed"}
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
      term.term,
      term.count,
      term.category,
      term.issues.join("; "),
      term.suggestedFix,
      term.proposedTerm,
      term.priority.toUpperCase(),
    ]),
  ]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  downloadFile(csvContent, "database_cleanup_report.csv", "text/csv");
}

function exportSQLScript() {
  const sqlStatements = filteredTerms
    .filter((term) => term.term !== term.proposedTerm)
    .map(
      (term) =>
        `-- Fix: ${term.term} -> ${term.proposedTerm} (${
          term.count
        } failed searches)\nUPDATE search_terms SET term = '${term.proposedTerm.replace(
          /'/g,
          "''"
        )}' WHERE term = '${term.term.replace(/'/g, "''")}';`
    )
    .join("\n\n");

  const sqlContent = `-- Database Cleanup Script\n-- Generated: ${new Date().toISOString()}\n-- Total terms to fix: ${
    filteredTerms.filter((term) => term.term !== term.proposedTerm).length
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
  document
    .getElementById("searchFilter")
    .addEventListener("input", applyFilters);
  document
    .getElementById("impactFilter")
    .addEventListener("change", applyFilters);
  document
    .getElementById("sortFilter")
    .addEventListener("change", applyFilters);

  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document
        .querySelectorAll(".category-btn")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      applyFilters();
    });
  });

  // Initialize
  loadData();
});
