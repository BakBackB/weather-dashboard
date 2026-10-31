const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

// Show the selected section.
tabButtons.forEach(button => {
    button.addEventListener("click", () => {
        tabPanels.forEach(panel => {
            panel.hidden = panel.id !== button.dataset.tab;
        });

        tabButtons.forEach(tab => {
            const isActive = tab === button;
            tab.classList.toggle("active", isActive);
            tab.setAttribute("aria-pressed", isActive);
        });
    });
});
