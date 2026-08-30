(function () {
  function setupPopup(popup, backdrop, closeBtn) {
    if (!popup || !backdrop || !closeBtn) return null;

    const scroller = popup.querySelector(".keynote-popup__content");

    function open() {
      if (scroller) scroller.scrollTop = 0;
      popup.classList.add("is-open");
      backdrop.classList.add("is-open");
    }

    function close() {
      popup.classList.remove("is-open");
      backdrop.classList.remove("is-open");
    }

    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", close);

    return { open, close };
  }

  const title = document.getElementById("page-title");
  const keynotePopup = setupPopup(
    document.getElementById("keynote-popup"),
    document.getElementById("keynote-popup-backdrop"),
    document.getElementById("keynote-popup-close"),
  );

  if (title && keynotePopup) {
    title.addEventListener("click", keynotePopup.open);
  }

  const cellPopup = setupPopup(
    document.getElementById("cell-popup"),
    document.getElementById("cell-popup-backdrop"),
    document.getElementById("cell-popup-close"),
  );
  const cellPopupContent = document.getElementById("cell-popup-content");

  if (cellPopup && cellPopupContent) {
    document.querySelectorAll(".cell-item").forEach((cellItem) => {
      const content = cellItem.querySelector(":scope > .cell-content");
      const detail = cellItem.querySelector(".cell-detail");
      if (!content || !detail) return;

      const group = cellItem.closest('[class^="cell_"]');
      const accentMatch = group && group.className.match(/cell_(\d+)/);
      const accent = accentMatch ? accentMatch[1] : "";

      content.addEventListener("click", () => {
        cellPopupContent.dataset.accent = accent;
        cellPopupContent.innerHTML = detail.innerHTML;
        cellPopup.open();
      });
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (keynotePopup) keynotePopup.close();
    if (cellPopup) cellPopup.close();
  });
})();
