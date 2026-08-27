/* ==========================================================================
   MÓDULO DE DRAG & DROP GLOBAL (dragDrop.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  // Estado Lexical Privado do Item em Arraste
  let currentDragItem = null;

  function setDragItem(item) {
    currentDragItem = item;
  }

  function getDragItem() {
    return currentDragItem;
  }

  function clearDragItem() {
    currentDragItem = null;
  }

  /* ---------- DROP ZONES GLOBAIS ---------- */
  function initGlobalDropZones() {
    const listFixed = $('#listFixed');
    const listVar = $('#listVariable');
    const listExtra = $('#listExtra');
    const listDebtors = $('#listDebtors');
    const listBenefits = $('#listBenefits');
    const assetGrid = $('#assetGridList');

    if (listFixed) {
      listFixed.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (currentDragItem) listFixed.classList.add('drag-container-over');
      });
      listFixed.addEventListener('dragleave', () => {
        listFixed.classList.remove('drag-container-over');
      });
      listFixed.addEventListener('drop', (e) => {
        e.preventDefault();
        listFixed.classList.remove('drag-container-over');
        if (!currentDragItem) return;
        if (currentDragItem.type === 'variable') {
          convertVariableToFixed(currentDragItem.id);
        } else if (currentDragItem.type === 'fixed') {
          moveExpenseToEndOfList('fixed', currentDragItem.fixedId || currentDragItem.id);
        }
      });
    }

    if (listVar) {
      listVar.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (currentDragItem) listVar.classList.add('drag-container-over');
      });
      listVar.addEventListener('dragleave', () => {
        listVar.classList.remove('drag-container-over');
      });
      listVar.addEventListener('drop', (e) => {
        e.preventDefault();
        listVar.classList.remove('drag-container-over');
        if (!currentDragItem) return;
        if (currentDragItem.type === 'fixed') {
          openConvertFixedToVarDialog(currentDragItem.fixedId || currentDragItem.id);
        } else if (currentDragItem.type === 'variable') {
          moveExpenseToEndOfList('variable', currentDragItem.id);
        }
      });
    }

    if (listExtra) {
      listExtra.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (currentDragItem && currentDragItem.type === 'extra') listExtra.classList.add('drag-container-over');
      });
      listExtra.addEventListener('dragleave', () => {
        listExtra.classList.remove('drag-container-over');
      });
      listExtra.addEventListener('drop', (e) => {
        e.preventDefault();
        listExtra.classList.remove('drag-container-over');
        if (currentDragItem && currentDragItem.type === 'extra') {
          moveExtraToEnd(currentDragItem.id);
        }
      });
    }

    if (listDebtors) {
      listDebtors.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (currentDragItem && currentDragItem.type === 'debtor') listDebtors.classList.add('drag-container-over');
      });
      listDebtors.addEventListener('dragleave', () => {
        listDebtors.classList.remove('drag-container-over');
      });
      listDebtors.addEventListener('drop', (e) => {
        e.preventDefault();
        listDebtors.classList.remove('drag-container-over');
        if (currentDragItem && currentDragItem.type === 'debtor') {
          moveDebtorToEnd(currentDragItem.id);
        }
      });
    }

    if (listBenefits) {
      listBenefits.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (currentDragItem && currentDragItem.type === 'benefit') listBenefits.classList.add('drag-container-over');
      });
      listBenefits.addEventListener('dragleave', () => {
        listBenefits.classList.remove('drag-container-over');
      });
      listBenefits.addEventListener('drop', (e) => {
        e.preventDefault();
        listBenefits.classList.remove('drag-container-over');
        if (currentDragItem && currentDragItem.type === 'benefit') {
          moveBenefitToEnd(currentDragItem.id);
        }
      });
    }

    if (assetGrid) {
      assetGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (currentDragItem && currentDragItem.type === 'asset') assetGrid.classList.add('drag-container-over');
      });
      assetGrid.addEventListener('dragleave', () => {
        assetGrid.classList.remove('drag-container-over');
      });
      assetGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        assetGrid.classList.remove('drag-container-over');
        if (currentDragItem && currentDragItem.type === 'asset') {
          moveAssetToEnd(currentDragItem.id);
        }
      });
    }
  }

  // APIs públicas do Módulo de Drag & Drop
  window.setDragItem = setDragItem;
  window.getDragItem = getDragItem;
  window.clearDragItem = clearDragItem;
  window.initGlobalDropZones = initGlobalDropZones;

})();
