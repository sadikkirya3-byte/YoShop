  // ===== IndexedDB Setup =====
  let db;
  const DB_NAME = 'posDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'appState';

  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        console.log('Database initialized successfully.');
        resolve(db);
      };

      request.onerror = (event) => {
        console.error('Database error:', event.target.errorCode);
        reject(event.target.errorCode);
      };
    });
  }

  function saveState(key, value) {
    return new Promise((resolve, reject) => {
      if (!db) return reject('DB not initialized');
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

  function loadState(key) {
    return new Promise((resolve, reject) => {
      if (!db) return reject('DB not initialized');
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = (event) => resolve(event.target.result ? event.target.result.value : null);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // ===== Data Handling =====
  let defaultMenu = [];
  let menu, activeOrders, transactions, settings, staff, dishCategories, customers;

  const defaultDishCategories = [];
  const defaultSettings = { 
    tableCount: 12,
    name: "My Business",
    address: "123 Business Avenue, Suite 100",
    contact: "555-123-4567",
    currency: "$",
    theme: "light",
    defaultMarkup: 200, // Default 200% markup
    lowStockThreshold: 10,
    taxRate: 0
  };
  const defaultStaff = [];
  
  let printerDevice = null;
  let printerType = null; // 'USB' or 'BLUETOOTH'
  let units;

  async function saveData() {
    try {
      await Promise.all([
        saveState('menu', menu),
        saveState('activeOrders', activeOrders),
        saveState('transactions', transactions),
        saveState('settings', settings),
        saveState('staff', staff),
        saveState('dishCategories', dishCategories),
        saveState('customers', customers),
        saveState('units', units)
      ]);
    } catch (error) {
      console.error("Failed to save data to IndexedDB:", error);
      alert("Error: Could not save data. Your changes might not persist.");
    }
  }

  function updateItemUnit(itemIndex, newUnit) {
    if (menu[itemIndex]) {
      menu[itemIndex].unit = newUnit;
      saveData();
    }
  }

  async function refreshApp() {
    try {
      await saveData();
      location.reload();
    } catch (error) {
      console.error("Failed to save data before refresh:", error);
      if (confirm("Could not save data before refreshing. You may lose unsaved changes. Do you still want to refresh?")) {
        location.reload();
      }
    }
  }

  function exitTableSelection() {
    document.getElementById('menuTab').dataset.tableId = '';
    // Switch to the tables tab for a clear workflow
    showTab('tablesTab', document.querySelector('nav button[onclick*="tablesTab"]'));
  }

  function updateCurrencyDisplay() {
    const symbol = settings.currency || '$';
    document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = symbol);
  }

  // ===== Tabs =====
  function showTab(tabId, btn) {
    document.querySelectorAll('section').forEach(sec => sec.classList.remove('active')); 
    const activeSection = document.querySelector(`#${tabId}`);
    activeSection.classList.add('active');

    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    toggleNav(false); // Close nav after selection

    // Special rendering logic for tabs
    switch (tabId) {
      case 'dashboardTab':
        updateDashboard();
        break;
      case 'transactionsTab':
        renderTransactions();
        break;
      case 'tablesTab':
        renderTables();
        break;
      case 'menuTab':
        const tableId = activeSection.dataset.tableId;
        renderMenu(tableId);
        break;
      case 'addDishTab':
        renderDishesTable();
        break;
      case 'settingsTab':
        renderCategoryList();
        renderUnitList();
        break;
      case 'stockTab':
        renderInventoryReport(); // For the low stock report
        renderStockListTable(); // For the main stock table
        renderUnitList();
        break;
      case 'reportsTab':
        populateReportFilters();
        renderReport();
        break;
    }
  }

  // ===== Navigation Toggle =====
  function toggleNav(forceState) {
    const nav = document.querySelector('nav');
    if (typeof forceState === 'boolean') {
      nav.classList.toggle('open', forceState);
    } else {
      nav.classList.toggle('open');
    }
  }

  // ===== Menu =====
  function renderMenu(tableId) {
    const container = document.getElementById('menuCategories');
    container.innerHTML = '';

    const searchTerm = document.getElementById('menuSearch')?.value.toLowerCase() || '';
    // Filter for the search term AND ensure the item is a sellable dish (has a recipe).
    // Also filter out items that don't have a category.
    const filteredMenu = menu.filter(dish => dish.category && (dish.name.toLowerCase().includes(searchTerm) || (dish.barcode && dish.barcode.toLowerCase().includes(searchTerm))) && dish.recipe && dish.recipe.length > 0);

    const categories = [...new Set(filteredMenu.map(d => d.category || "Uncategorized"))];
    
    const menuTab = document.getElementById('menuTab');
    const menuTabTitle = document.getElementById('menuTabTitle');
    const exitTableBtn = document.getElementById('exitTableBtn');
    categories.forEach(cat => {
      const catDiv = document.createElement('div');
      if (cat !== "Uncategorized") {
        catDiv.innerHTML = `<h4>${cat}</h4>`;
      }
      const grid = document.createElement('div');
      grid.className = 'menu-grid';
      filteredMenu
          .filter(d => (d.category || "Uncategorized") === cat)
          .forEach((dish, i) => {
            const item = document.createElement('div');
            const currentOrder = activeOrders[tableId] || { items: [] };
            const orderItem = currentOrder.items.find(o => o.name === dish.name);
            const quantity = orderItem ? orderItem.qty : 0;

            let itemClasses = 'menu-item';
            if (quantity > 0) itemClasses += ' active';

            item.className = itemClasses;
            item.onclick = (e) => { // Allow adding item by clicking the card
              if (!tableId) return alert("Please select a table first from the 'Tables' tab.");
              if (e.target.closest('.item-controls')) return;
              addToOrder(tableId, dish.name);
            };

            item.innerHTML = `
              <img src="${dish.image}" alt="">
              <div style="padding: 10px;">
                <div class="menu-item-header">
                  <h4>${dish.name}</h4>
                  <p><span class="currency-symbol">${settings.currency || '$'}</span>${formatCurrency(dish.price)}</p>
                </div>
                ${tableId ? `
                  <div class="item-controls">
                    <button onclick="decreaseQty('${tableId}', '${dish.name}')" ${quantity === 0 ? 'disabled' : ''}>-</button>
                    <span style="font-weight: bold; min-width: 20px; text-align: center;">${quantity}</span>
                    <button onclick="addToOrder('${tableId}', '${dish.name}')">+</button>
                  </div>` : ''
                }
              </div>`;
            grid.appendChild(item);
          });
      catDiv.appendChild(grid);
      container.appendChild(catDiv);
    });

    const isTableSelected = !!tableId;
    document.getElementById('menuOrderSummary').querySelectorAll('.btn').forEach(button => {
        button.disabled = !isTableSelected;
    });

    if (!tableId) {
      menuTabTitle.textContent = '';
      menuTabTitle.parentElement.style.display = 'none';
      exitTableBtn.style.display = 'none';
    } else {
      menuTabTitle.textContent = `Order for Table ${tableId}`;
      menuTabTitle.parentElement.style.display = 'flex';
      exitTableBtn.style.display = 'block';
    }

    updateOrders(tableId);
    renderDishesTable();
    saveData();
  }

  async function addDish(buttonElement) {
    const name = document.getElementById('dishName').value.trim();    
    const barcode = document.getElementById('dishBarcode').value.trim();
    const category = document.getElementById('dishCategory').value;
    const imageInput = document.getElementById('dishImage');
    const file = imageInput.files[0];

    if (!name) {
      return alert("Please enter a valid name.");
    }

    if (!category) {
      return alert("Please select a category for the dish.");
    }

    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.textContent = 'Processing...';
    }
    
    let totalRecipeCost = 0;
    const recipe = Array.from(document.querySelectorAll('#recipeItemsContainer .recipe-item')).map(itemDiv => {
        totalRecipeCost += parseFloat(itemDiv.dataset.cost) || 0;
        return {
            itemName: itemDiv.dataset.itemName,
            quantity: parseFloat(itemDiv.dataset.quantity)
        };
    });

    const costPrice = totalRecipeCost;
    const price = parseFloat(document.getElementById('dishSellingPrice').value) || 0;

    try {
      const dishIndex = document.getElementById('dishIndex').value;
      if (dishIndex !== '') {
        // It's an update
        const index = parseInt(dishIndex, 10);
        const existingImage = document.getElementById('dishImageBase64').value;

        let dishData = { name, barcode, category, recipe, costPrice, price, image: existingImage };
        
        if (file) { dishData.image = await toBase64(file); }

        menu[index] = dishData;

      } else {
        // It's a new dish
        let dishData = { name, barcode, category, recipe, costPrice, price, image: "https://placehold.co/100" }; // Start with placeholder
        if (file) {
          dishData.image = await toBase64(file);
        }
        // Clear form only for new dishes
        document.getElementById('dishName').value = '';
        document.getElementById('dishBarcode').value = '';
        imageInput.value = ''; // Reset file input
        menu.push(dishData);
      }

      renderMenu(document.getElementById('menuTab').dataset.tableId);
      renderDishesTable(); // Update the dishes list
      updateDashboard();
      saveData(); // Ensure changes are saved
      toggleAddDishForm(false); // Hide form on save
    } catch (error) {
      console.error("Error adding dish:", error);
      alert("Failed to save dish: " + error.message);
    } finally {
      if (buttonElement) {
        buttonElement.disabled = false;
        const dishIndex = document.getElementById('dishIndex').value;
        buttonElement.textContent = dishIndex !== '' ? 'Update' : 'Save'; // Restore original text
      }
    }
  }

  function generateRandomBarcode() {
    // Generate a random 12-digit number (like UPC)
    const code = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    document.getElementById('dishBarcode').value = code;
  }

  function editDish(index) {
    
    const dish = menu[index];
    document.getElementById('dishIndex').value = index;
    document.getElementById('dishName').value = dish.name;
    document.getElementById('dishBarcode').value = dish.barcode || '';
    document.getElementById('dishCategory').value = dish.category;
    
    document.getElementById('dishImageBase64').value = dish.image || ''; // Store current image
    document.getElementById('dishSellingPrice').value = (dish.price || 0);

    // Show the form first to ensure all elements are visible and ready.
    toggleAddDishForm(true); 
    document.getElementById('recipeItemsContainer').innerHTML = '';

    // Now that the form is visible and dropdowns are populated, set the category.
    document.getElementById('dishCategory').value = dish.category;

    // Populate recipe builder
    const recipeContainer = document.getElementById('recipeItemsContainer'); 
    if (dish.recipe) {
        dish.recipe.forEach(recipeComponent => {
            addRecipeItem(recipeComponent.itemName, recipeComponent.quantity);
        });
    }
    updateRecipeTotals();

    // If the edit button was clicked from the settings tab, switch to the dishes tab
    const settingsTab = document.getElementById('settingsTab');
    if (settingsTab.classList.contains('active')) {
        showTab('addDishTab', document.querySelector('nav button[onclick*="addDishTab"]'));
    }
  }

  function addRecipeItem(selectedItem, quantity) {
    const ingredient = menu.find(item => item.name === selectedItem && !item.recipe);
    if (!ingredient) return; 

    if (ingredient.stock !== undefined && ingredient.stock <= 0) {
      alert(`"${ingredient.name}" is out of stock. Please add this item to your stock before using it in a recipe.`);
      return;
    }
    
    const container = document.getElementById('recipeItemsContainer');
    const itemDiv = document.createElement('div');
    itemDiv.className = 'recipe-item';
    itemDiv.dataset.itemName = selectedItem;
    itemDiv.dataset.quantity = quantity;
    itemDiv.dataset.cost = (ingredient.costPrice || 0) * quantity;

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => {
      itemDiv.remove();
      updateRecipeTotals();
    };

    itemDiv.innerHTML = `<span style="flex-grow: 1;">${quantity} x ${selectedItem}</span>
                         <span><span class="currency-symbol">$</span>${formatCurrency((ingredient.costPrice || 0) * quantity)}</span>`;
    itemDiv.appendChild(removeBtn);
    container.appendChild(itemDiv);
  }

  function addNewRecipeItemFromForm() {
    const select = document.getElementById('newRecipeItemSelect');
    const qtyInput = document.getElementById('newRecipeItemQty');
    const itemName = select.value;
    const quantity = parseFloat(qtyInput.value);

    if (itemName && !isNaN(quantity) && quantity > 0) {
      addRecipeItem(itemName, quantity);
      updateRecipeTotals();
    }
  }

  function updateRecipeItemUnit() {
    const select = document.getElementById('newRecipeItemSelect');
    const unitInput = document.getElementById('newRecipeItemUnit');
    const selectedIngredientName = select.value;
    const ingredient = menu.find(item => item.name === selectedIngredientName);
    unitInput.value = ingredient ? (ingredient.unit || 'N/A') : '';
  }

  function updateRecipeTotals() {
    const recipeItems = document.querySelectorAll('#recipeItemsContainer .recipe-item');
    let totalCost = 0;
    recipeItems.forEach(item => {
        totalCost += parseFloat(item.dataset.cost) || 0;
    });

    document.getElementById('dishCostPrice').value = formatCurrency(totalCost);

    const sellingPrice = parseFloat(document.getElementById('dishSellingPrice').value) || 0;
    const profitValue = sellingPrice - totalCost;
    const profitMargin = sellingPrice > 0 ? (profitValue / sellingPrice) * 100 : 0;

    document.getElementById('dishProfitValue').textContent = formatCurrency(profitValue); // Currency, so formatCurrency is fine
    document.getElementById('dishProfitMargin').textContent = profitMargin.toLocaleString(undefined, { maximumFractionDigits: 1 }); // Percentage, max 1 decimal
  }

  function calculateRecipeCost(recipe) {
      if (!recipe) return 0;
      return recipe.reduce((total, component) => {
          const ingredient = menu.find(item => item.name === component.itemName && !item.recipe);
          if (ingredient) {
              return total + (ingredient.costPrice || 0) * component.quantity;
          }
          return total;
      }, 0);
  }

  function populateRecipeIngredientSelect() {
      const select = document.getElementById('newRecipeItemSelect');
      const ingredients = menu.filter(item => !item.recipe && item.stock > 0); // Only show raw ingredients with stock
      select.innerHTML = ingredients.map(item => `<option value="${item.name}">${item.name} (Stock: ${Number(item.stock).toFixed(1)})</option>`).join('');
  }


  // Helper to convert file to Base64 with resizing
  const toBase64 = file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = event => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
              const elem = document.createElement('canvas');
              const maxWidth = 800; // Resize to max 800px to save space and memory
              const maxHeight = 800;
              let width = img.width;
              let height = img.height;

              if (width > height) {
                  if (width > maxWidth) {
                      height *= maxWidth / width;
                      width = maxWidth;
                  }
              } else {
                  if (height > maxHeight) {
                      width *= maxHeight / height;
                      height = maxHeight;
                  }
              }
              elem.width = width;
              elem.height = height;
              const ctx = elem.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              resolve(elem.toDataURL('image/jpeg', 0.7)); // Compress to JPEG 70%
          };
          img.onerror = error => reject(new Error("Failed to process image data."));
      };
      reader.onerror = error => reject(new Error("File reading failed. Please check app permissions."));
  });

  function previewDishImage(input) {
    const preview = document.getElementById('dishImagePreview');
    if (input.files && input.files[0]) {
      // Use the robust toBase64 function for preview as well
      toBase64(input.files[0]).then(base64 => {
        preview.src = base64;
      }).catch(e => {
        console.error(e);
        alert("Could not preview image: " + e.message);
        input.value = ''; // Clear input
        preview.src = 'https://placehold.co/100';
      });
    } else {
      preview.src = 'https://placehold.co/100';
    }
  }
  function toggleAddDishForm(show) {
    const formContainer = document.getElementById('addDishFormContainer');
    const toggleButton = document.querySelector('#addDishTab h3 button');
    if (show) {
      formContainer.style.display = 'block';
      populateRecipeIngredientSelect();
      updateRecipeItemUnit();
      populateCategoryDropdown();
      toggleButton.style.display = 'none';
    } else {
      document.getElementById('dishIndex').value = ''; // Clear index on hide
      formContainer.style.display = 'none';
      toggleButton.style.display = 'inline-block';
      document.getElementById('recipeItemsContainer').innerHTML = ''; // Clear recipe on close
      document.getElementById('dishName').value = '';
      document.getElementById('dishBarcode').value = '';
      document.getElementById('dishImagePreview').src = 'https://placehold.co/100';
      document.getElementById('dishImageBase64').value = '';
      document.getElementById('dishSellingPrice').value = '';
    }
  }

  function formatCurrency(number) {
    const num = parseFloat(number) || 0;
    // Using toLocaleString to automatically add thousand separators and limit to 1 decimal place
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }

  // ===== Bill Splitting (New Implementation) =====
  let splitState = { unassigned: [], bills: [] };

  function openBillSplitModal() {
    const tableId = document.getElementById('menuTab').dataset.tableId;
    const currentOrder = activeOrders[tableId];
    if (!tableId || !currentOrder || currentOrder.items.length === 0) {
      return alert("No active order to split.");
    }
    document.getElementById('splitBillTableId').textContent = tableId;

    // Initialize split state from the current order
    splitState.unassigned = JSON.parse(JSON.stringify(currentOrder.items)); // Deep copy
    splitState.bills = [];

    renderSplitBillUI();
    document.getElementById('billSplitModal').style.display = 'flex';
  }

  function closeSplitBillModal() {
    document.getElementById('billSplitModal').style.display = 'none';
    // Clear state to avoid issues on next open
    splitState = { unassigned: [], bills: [] };
  }

  function renderSplitBillUI() {
    const unassignedContainer = document.getElementById('unassignedItems');
    const splitBillsContainer = document.getElementById('splitBillsContainer');
    unassignedContainer.innerHTML = '';
    splitBillsContainer.innerHTML = '';

    // Render unassigned items
    splitState.unassigned.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'split-item';
      itemEl.innerHTML = `<span>${item.qty}x ${item.name}</span><span><span class="currency-symbol">$</span>${formatCurrency(item.price * item.qty)}</span>`;
      itemEl.onclick = () => moveItemToFirstBill(index);
      unassignedContainer.appendChild(itemEl);
    });

    // Render split bills
    splitState.bills.forEach((bill, billIndex) => {
      const billBox = document.createElement('div');
      billBox.className = 'split-bill-box';
      let billTotal = 0;

      let itemsHtml = bill.items.map((item, itemIndex) => {
        billTotal += item.price * item.qty;
        return `<div class="split-item" onclick="moveItemToUnassigned(${billIndex}, ${itemIndex})">
                  <span>${item.qty}x ${item.name}</span>
                  <span><span class="currency-symbol">$</span>${formatCurrency(item.price * item.qty)}</span>
                </div>`;
      }).join('');

      billBox.innerHTML = `
        <h5 style="margin-top: 0; display: flex; justify-content: space-between;">
          <span>Person ${billIndex + 1}</span>
          <button class="icon-btn" onclick="removeSplitBill(${billIndex})" title="Remove Bill" style="font-size: 14px;">✖</button>
        </h5>
        <div style="display: flex; flex-direction: column; gap: 8px; flex-grow: 1;">${itemsHtml}</div>
        <div class="total" style="margin-top: 10px;">Total: <span class="currency-symbol">$</span>${formatCurrency(billTotal)}</div>
      `;
      splitBillsContainer.appendChild(billBox);
    });

    document.getElementById('processSplitBtn').disabled = splitState.unassigned.length > 0 || splitState.bills.length === 0;
    updateCurrencyDisplay();
  }

  function addSplitBill() {
    splitState.bills.push({ items: [] });
    renderSplitBillUI();
  }

  function removeSplitBill(billIndex) {
    const bill = splitState.bills[billIndex];
    // Move all items from this bill back to unassigned
    splitState.unassigned.push(...bill.items);
    splitState.bills.splice(billIndex, 1);
    renderSplitBillUI();
  }

  function moveItemToFirstBill(itemIndex) {
    if (splitState.bills.length === 0) {
      addSplitBill(); // Auto-create the first bill if none exist
    }
    const item = splitState.unassigned.splice(itemIndex, 1)[0];
    splitState.bills[0].items.push(item);
    renderSplitBillUI();
  }

  function moveItemToUnassigned(billIndex, itemIndex) {
    const item = splitState.bills[billIndex].items.splice(itemIndex, 1)[0];
    splitState.unassigned.push(item);
    renderSplitBillUI();
  }

  async function processSplitPayments() {
    if (splitState.unassigned.length > 0) {
      return alert("Please assign all items before processing payments.");
    }

    const tableId = document.getElementById('menuTab').dataset.tableId;
    const serverName = activeOrders[tableId].server || 'N/A';
    closeSplitBillModal();

    for (let i = 0; i < splitState.bills.length; i++) {
      const bill = splitState.bills[i];
      const billTotal = calculateTransactionTotals(bill.items).total;

      // Use a promise to wait for each payment to be confirmed
      const paymentConfirmed = await new Promise(resolve => {
        document.getElementById('paymentTotalDue').textContent = formatCurrency(billTotal);
        document.getElementById('paymentModal').style.display = 'flex';
        document.querySelector('#paymentModal h3').textContent = `Payment for Person ${i + 1} / ${splitState.bills.length}`;
        toggleCashPaymentFields();
        calculateChange();

        document.getElementById('confirmPaymentBtn').onclick = () => resolve(true);
        document.querySelector('#paymentModal button[onclick*="Cancel"]').onclick = () => resolve(false);
      });

      if (paymentConfirmed) {
        const paymentMethod = document.getElementById('paymentMethod').value;
        const transaction = { date: new Date().toISOString(), customerName: serverName, tableNo: tableId, items: bill.items, total: billTotal, paymentMethod: paymentMethod };
        transactions.unshift(transaction);
        bill.items.forEach(item => deductStock(item.name, item.qty));
        document.getElementById('paymentModal').style.display = 'none';
      } else {
        alert("Payment cancelled. Remaining split bills will not be processed.");
        saveData(); // Save any payments that were processed
        return; // Exit the loop
      }
    }

    // All payments processed, clear the original order
    delete activeOrders[tableId];
    saveData();
    renderMenu(tableId);
    renderTables();
    updateDashboard();
    document.getElementById('servedBy').value = '';
    alert(`All split payments for Table ${tableId} processed successfully!`);
  }

  // ===== Orders =====
  function addToOrder(tableId, name, notes = null) {
    if (!tableId) return alert("Please select a table first.");
    if (!activeOrders[tableId]) {
      activeOrders[tableId] = { items: [], server: '' };
    }

    // If notes are being added, we always create a new item.
    if (notes !== null) {
        const note = prompt(`Add special requests for ${name}:`, "");
        if (note !== null) { // prompt not cancelled
            // Add as a new line item with a unique ID
            activeOrders[tableId].items.push({ ...dish, qty: 1, notes: note, id: Date.now() });
            updateOrders(tableId);
            renderMenu(tableId);
        }
        return;
    }

    const dish = menu.find(d => d.name === name);
    const existing = activeOrders[tableId].items.find(o => o.name === name && !o.notes);
    if (existing) existing.qty++;
    else activeOrders[tableId].items.push({ ...dish, qty: 1 });

    updateOrders(tableId);
    renderMenu(tableId);
  }

  function decreaseQty(tableId, name, id = null) {
    if (!tableId || !activeOrders[tableId]) return;

    const orderItem = id ? activeOrders[tableId].items.find(o => o.id === id) : activeOrders[tableId].items.find(o => o.name === name && !o.notes);
    if (!orderItem) return;

    if (orderItem.qty > 1) {
      orderItem.qty--;
    } else {
      const itemIndex = activeOrders[tableId].items.findIndex(o => (id ? o.id === id : (o.name === name && !o.notes)));
      if (itemIndex > -1) activeOrders[tableId].items.splice(itemIndex, 1);
    }
    updateOrders(tableId);
    renderMenu(tableId);
  }

  // ===== Tables =====
  function renderTables() {
    const grid = document.getElementById('tablesGrid');
    grid.innerHTML = ''; // Clear existing tables
    for (let i = 1; i <= (settings.tableCount || 12); i++) {
      const tableCard = document.createElement('div');
      const order = activeOrders[i];
      const status = order && order.items.length > 0 ? 'occupied' : 'available';
      tableCard.className = `table-card ${status}`;
      tableCard.dataset.tableId = i;
      tableCard.innerHTML = `
        <span>Table ${i}</span>
        ${status === 'occupied' ? `<div class="table-total"><span class="currency-symbol">$</span>${formatCurrency(order.items.reduce((sum, item) => sum + (item.price * item.qty), 0))}</div>` : ''}
      `;
      tableCard.onclick = () => {
        document.getElementById('menuTab').dataset.tableId = i; // Set table ID for the menu
        showTab('menuTab', document.querySelector('nav button[onclick*="menuTab"]'));
      };
      grid.appendChild(tableCard);
    }
  }

  function updateOrders(tableId) {
    if (!tableId) {
      document.getElementById('menuTotal').textContent = '0';
      return;
    }

    const currentOrder = activeOrders[tableId] || { items: [] };
    
    const totals = calculateTransactionTotals(currentOrder.items);
    const total = totals.total;

    document.getElementById('menuTotal').textContent = formatCurrency(total);
    saveData();
    updateDashboard(); // Add this line to update dashboard cards in real-time
  }

  function processBill() { // This now opens the payment modal
    const tableId = document.getElementById('menuTab').dataset.tableId;
    if (!tableId || !activeOrders[tableId] || activeOrders[tableId].items.length === 0) {
      return alert("Cannot bill an empty order.");
    }
    const currentOrder = activeOrders[tableId];
    const total = calculateTransactionTotals(currentOrder.items).total;

    document.getElementById('paymentTotalDue').textContent = formatCurrency(total);
    document.getElementById('splitPaymentContainer').style.display = 'none'; // Hide split view
    document.getElementById('paymentDetails').style.display = 'block'; // Show single payment view
    document.getElementById('confirmPaymentBtn').onclick = () => finalizePayment(); // Set correct handler
    document.getElementById('paymentModal').style.display = 'flex';
    toggleCashPaymentFields(); // Initialize view based on default selection
    calculateChange(); // Initialize change calculation
  }

  function toggleCashPaymentFields() {
    const paymentMethod = document.getElementById('paymentMethod').value;
    const cashFields = document.getElementById('cashPaymentFields');
    cashFields.style.display = (paymentMethod === 'Cash') ? 'block' : 'none';
  }

  function calculateChange() {
    const totalDue = parseFloat(document.getElementById('paymentTotalDue').textContent);
    const amountTendered = parseFloat(document.getElementById('amountTendered').value) || 0;
    const change = amountTendered - totalDue;
    document.getElementById('changeDue').textContent = change > 0 ? formatCurrency(change) : '0';
  }

  function finalizePayment(isSplit = false) {
    const tableId = document.getElementById('menuTab').dataset.tableId;
    const currentOrder = activeOrders[tableId];
    const paymentMethod = document.getElementById('paymentMethod').value;
    const amountTendered = parseFloat(document.getElementById('amountTendered').value);
    const totals = calculateTransactionTotals(currentOrder.items);
    const total = totals.total;

    if (paymentMethod === 'Cash' && (isNaN(amountTendered) || amountTendered < total)) {
      return alert("Amount tendered must be greater than or equal to the total due.");
    }

    // Decrement stock
    currentOrder.items.forEach(orderItem => {
        const dish = menu.find(d => d.name === orderItem.name);
        if (dish) {
            // This function will recursively deduct stock
            deductStock(dish.name, orderItem.qty);
        }
    });
    

    const transaction = {
      date: new Date().toISOString(),
      customerName: document.getElementById('servedBy').value || 'N/A',
      tableNo: tableId,
      items: [...currentOrder.items],
      total: total,
      subtotal: totals.subtotal,
      tax: totals.tax,
      paymentMethod: paymentMethod
    };
    if (isSplit) {
        // If it's a split payment, we just add the transaction and return.
        // The calling function will handle UI and data clearing.
        return transaction;
    }
    transactions.unshift(transaction);

    delete activeOrders[tableId]; // Clear the order for the table
    saveData();
    renderMenu(tableId);
    renderTables();
    updateDashboard();
    document.getElementById('paymentModal').style.display = 'none';
    document.getElementById('servedBy').value = '';
    alert(`Bill for Table ${tableId} processed successfully!`);
  }

  // Helper to calculate subtotal, tax, and total
  function calculateTransactionTotals(items) {
    const subtotal = items.reduce((sum, o) => sum + (o.qty * o.price), 0);
    const taxRate = settings.taxRate || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }

  function calculateOrderTotal(items) {
      return calculateTransactionTotals(items).total;
  }

  function calculateDishStock(dish, isForDisplay = false) {
    // Base case: If the item has no recipe, it's a primary ingredient. Return its own stock.
    if (!dish.recipe || dish.recipe.length === 0) {
        return dish.stock !== undefined ? dish.stock : (isForDisplay ? 0 : Infinity);
    }

    let maxPossibleServings = Infinity;

    // Recursive case: Calculate stock based on the stock of its components.
    for (const component of dish.recipe) {
        const componentDish = menu.find(d => d.name === component.itemName);
        if (!componentDish) return 0; // A component of the recipe doesn't exist.

        // Recursively calculate the stock of the component dish.
        const componentStock = calculateDishStock(componentDish, isForDisplay);
        
        const possibleServings = Math.floor(componentStock / component.quantity);
        if (possibleServings < maxPossibleServings) {
            maxPossibleServings = possibleServings;
        }
    }

    return maxPossibleServings === Infinity ? 0 : maxPossibleServings;
  }

  function deductStock(itemName, quantity) {
    const dish = menu.find(d => d.name === itemName);
    if (!dish) return;

    // Base case: Item is a primary ingredient, deduct from its own stock.
    if (!dish.recipe || dish.recipe.length === 0) {
        if (dish.stock !== undefined) {
            dish.stock -= quantity;
            if (dish.stock <= (settings.lowStockThreshold || 10)) {
                sendLowStockNotification(dish.name, dish.stock);
            }
        }
    } else { // Recursive case: Item is a composite dish, deduct from its components.
        dish.recipe.forEach(component => deductStock(component.itemName, component.quantity * quantity));
    }
  }
  // ===== Dishes Table =====
  function renderDishesTable() {
    const tbody = document.getElementById('dishesTableBody');
    tbody.innerHTML = '';
    // Filter the menu to only show items that are actual dishes (i.e., have a recipe property).
    // This separates sellable dishes from raw inventory items.
    menu.filter(dish => dish.recipe).forEach((dish) => {
      const i = menu.indexOf(dish); // Get the original index for edit/delete functions
      const stock = calculateDishStock(dish);
      const costPrice = dish.costPrice || 0;
      const sellingPrice = dish.price || 0;
      const profitValue = sellingPrice - costPrice;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><img src="${dish.image}" alt=""></td>
        <td>${dish.name}</td> 
        <td style="text-align: right; white-space: nowrap;"><span class="currency-symbol">${settings.currency || '$'}</span>${formatCurrency(costPrice)}</td>
        <td style="text-align: right; white-space: nowrap;"><span class="currency-symbol">${settings.currency || '$'}</span>${formatCurrency(sellingPrice)}</td>
        <td style="text-align: right; white-space: nowrap;"><span class="currency-symbol">${settings.currency || '$'}</span>${formatCurrency(profitValue)}</td>
        <td style="text-align: right;">
          <button class="icon-btn" title="Print Label" onclick="printDishLabel(${i})"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 0v2H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1v-2a2 2 0 0 0-2-2H5z"/></svg></button>
          <button class="icon-btn" title="Edit Dish" onclick="editDish(${i})"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V12h2.293l6.5-6.5-.207-.207z"/></svg></button>
          <button class="icon-btn" title="Delete Dish" onclick="deleteItem(${i})"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#dc3545" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg></button>
        </td>`;
      tbody.appendChild(tr);
    });
  }
  
  // Adjust dishes table header
  (function() {
    const headerRow = document.querySelector('#addDishTab table thead tr');
    if (headerRow) {
      // Header is now directly in HTML, this is no longer needed.
    }
  })();

  function deleteItem(i) {
    const index = Number(i); // Ensure index is a number
    const item = menu[index];
    if (!item) return;

    if (confirm(`Are you sure you want to delete ${item.name}?`)) {
      menu.splice(index, 1);
      saveData(); // Persist the deletion
      
      // Safely update all views with error handling to prevent one failure from stopping the rest
      // Update UI components immediately
      try { renderStockListTable(); } catch (e) { console.error("Error updating stock:", e); }
      try { renderDishesTable(); } catch (e) { console.error("Error updating dishes:", e); }
      try { renderInventoryReport(); } catch (e) { console.error("Error updating inventory:", e); }
      try { updateDashboard(); } catch (e) { console.error("Error updating dashboard:", e); }
      
      try {
        const menuTab = document.getElementById('menuTab');
        const tableId = menuTab ? menuTab.dataset.tableId : null;
        renderMenu(tableId);
      } catch (e) { console.error("Error updating menu:", e); }
      
      try { renderDishesTable(); } catch (e) { console.error("Error updating dishes:", e); }
      try { renderStockListTable(); } catch (e) { console.error("Error updating stock:", e); }
      try { renderInventoryReport(); } catch (e) { console.error("Error updating inventory:", e); }
      try { updateDashboard(); } catch (e) { console.error("Error updating dashboard:", e); }
      saveData(); // Persist the deletion
    }
  }

  // ===== Receipt =====
  function previewOrder(transactionData = null) {
    const receiptModal = document.getElementById('receiptModal');
    let currentTransaction;
    const tableId = document.getElementById('menuTab').dataset.tableId;

    if (transactionData) {
      currentTransaction = transactionData;
      // Store the historical transaction data on the modal itself for the print function to use
      receiptModal._transactionData = transactionData;
    } else {
      const currentOrder = activeOrders[tableId];
      if (!currentOrder || currentOrder.items.length === 0) {
        return alert("No active order to preview.");
      } else {
        const totals = calculateTransactionTotals(currentOrder.items);
        currentTransaction = {
          date: new Date().toLocaleString(),
          customerName: document.getElementById('servedBy').value || 'N/A',
          tableNo: tableId,
          items: [...currentOrder.items],
          total: totals.total,
          subtotal: totals.subtotal,
          tax: totals.tax
        };
        // Clear any previously stored historical transaction
        receiptModal._transactionData = null;
      }
    }

    // Populate the content and then display the modal
    populateReceiptContent(currentTransaction);
    document.getElementById('receiptModal').style.display = 'flex';
    
    updateCurrencyDisplay();
  }
  
  async function downloadCurrentReceiptAsPDF() {
    if (typeof window.jspdf === 'undefined' || typeof html2canvas === 'undefined') {
        alert("PDF generation libraries are not loaded. Please check your internet connection.");
        return;
    }
    const receiptContentEl = document.getElementById('receiptContent');
    const { jsPDF } = window.jspdf;

    try {
        const canvas = await html2canvas(receiptContentEl, {
            scale: 2, // Increase scale for better quality
            useCORS: true // Important for external images
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`receipt-${Date.now()}.pdf`);

    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Could not generate PDF. There might be an issue with the receipt content.");
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (printerDevice) {
      updatePrinterStatus(true, printerDevice.productName || 'Connected Device');
    }
  });

  function handleServerChange() {
    // Check if the receipt modal is currently visible
    const receiptModal = document.getElementById('receiptModal');
    if (receiptModal.style.display === 'flex' && !receiptModal._transactionData) {
      // If it's visible, re-render the preview to show the new server name
      // Only do this for active orders, not historical ones.
      previewOrder();
    }
  }

  function printReceipt() {
    // If a device is connected, the user might want to use that instead.
    if (printerDevice) {
      if (confirm("A thermal printer is connected. Do you want to print directly to the device instead of the browser's print dialog?")) {
        return directPrint();
      }
    }
    const receiptModal = document.getElementById('receiptModal');
    let printTransaction = receiptModal._transactionData; // Check for a historical transaction first

    if (!printTransaction) {
      // If no historical transaction is being viewed, get the active order
      const tableId = document.getElementById('menuTab').dataset.tableId;
      const currentOrder = activeOrders[tableId];
      if (!currentOrder || currentOrder.items.length === 0) return alert("No active order to print.");
      const totals = calculateTransactionTotals(currentOrder.items);
      printTransaction = {
        date: new Date().toLocaleString(),
        customerName: document.getElementById('servedBy').value || 'N/A',
        tableNo: tableId,
        items: [...currentOrder.items],
        total: totals.total,
        subtotal: totals.subtotal,
        tax: totals.tax
      };
    }

    const { date, customerName, tableNo, items, total } = printTransaction; 
    const transactionId = new Date(date).getTime();

    const currencySymbol = settings.currency || '$';
    const receiptHtml = `<div class="receipt-header"><div class="logo">${settings.logo ? `<img src="${settings.logo}" style="width:50px; height:50px; object-fit:contain;">` : '🧾'}</div><h3>${settings.name || 'My Business'}</h3><p>${settings.address || '123 Business Avenue, Suite 100'}</p></div><div class="receipt-details"><div><span>Transaction ID:</span> <span>${transactionId}</span></div><div><span>Date:</span> <span>${new Date(date).toLocaleDateString()}</span></div><div><span>Time:</span> <span>${new Date(date).toLocaleTimeString()}</span></div><div><span>Served By:</span> <span>${customerName}</span></div><div><span>Table:</span> <span>${tableNo}</span></div></div><div class="receipt-items"><div class="table-header"><div class="col-name">Item</div><div class="col-qty">Qty</div><div class="col-price">Price</div><div class="col-total">Total</div></div>${items.map(o => `<div class="item-row"><div class="col-name">${o.name} ${o.notes ? `<br><small style="font-style: italic;">- ${o.notes}</small>` : ''}</div><div class="col-qty">${o.qty}x</div><div class="col-price">${currencySymbol}${formatCurrency(o.price)}</div><div class="col-total">${currencySymbol}${formatCurrency(o.qty * o.price)}</div></div>`).join('')}</div><div class="receipt-summary"><div class="summary-line total"><span>TOTAL</span> <span>${currencySymbol}${formatCurrency(total)}</span></div></div><div class="receipt-footer"><p>Thank you for your visit!</p><p class="promo">Get 10% off on your next visit!</p></div>`;
    const printWindow = window.open('', 'Print Receipt', 'width=420,height=600,scrollbars=yes');
    printWindow.document.write(`<html><head><title>Print Receipt</title><style>body { margin: 0; padding: 10px; background: #f0f0f0; } .receipt-paper { font-family: 'Courier New', Courier, monospace; background: #fff; color: #000; padding: 15px; border: 1px solid #ccc; max-width: 400px; margin: auto; } .receipt-header { text-align: center; margin-bottom: 15px; } .receipt-header .logo { font-size: 40px; margin-bottom: 5px; } .receipt-header h3 { margin: 0; font-size: 1.2em; } .receipt-header p { margin: 2px 0; font-size: 0.8em; } .receipt-details { font-size: 0.8em; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; margin-bottom: 10px; } .receipt-details div { display: flex; justify-content: space-between; } .receipt-items .table-header { display: flex; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px; font-size: 0.8em; } .receipt-items .item-row { display: flex; margin-bottom: 3px; font-size: 0.8em; } .receipt-items .col-name { width: 50%; } .receipt-items .col-qty { width: 10%; text-align: left; } .receipt-items .col-price { width: 20%; text-align: right; } .receipt-items .col-total { width: 20%; text-align: right; } .receipt-summary { border-top: 1px dashed #000; padding-top: 10px; margin-top: 15px; font-size: 0.9em; } .summary-line { display: flex; justify-content: space-between; margin-bottom: 5px; } .summary-line.total { font-weight: bold; font-size: 1.1em; } .receipt-footer { text-align: center; margin-top: 20px; font-size: 0.8em; } .receipt-footer .promo { margin-top: 10px; font-weight: bold; }</style></head><body><div class="receipt-paper">${receiptHtml}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus(); // Focus on the new window
    printWindow.print(); // Trigger the print dialog
  }
  
  // ===== Scanner Functions =====
  let keepReadingSerial = false;
  let serialDataBuffer = '';

  async function connectUSBScanner() {
    // Try Web Serial API for USB scanners in Serial Mode
    if ("serial" in navigator) {
      try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        keepReadingSerial = true;
        readSerialLoop(port);

        document.getElementById('scannerConnectionStatus').textContent = 'Connected (Serial)';
        document.getElementById('scannerConnectionStatus').style.color = '#28a745';
        alert("Connected to Serial Scanner.");
      } catch (error) {
        console.error('Serial connection failed:', error);
        alert('Failed to connect to serial scanner: ' + error.message);
      }
    } else {
      alert("Web Serial API not supported. If your scanner is in HID mode, it works automatically.");
    }
  }

  async function readSerialLoop(port) {
    while (port.readable && keepReadingSerial) {
      const reader = port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const text = new TextDecoder().decode(value);
          serialDataBuffer += text;

          if (serialDataBuffer.includes('\n') || serialDataBuffer.includes('\r')) {
            const parts = serialDataBuffer.split(/[\r\n]+/);
            serialDataBuffer = parts.pop(); // Keep incomplete part
            
            for (const code of parts) {
              if (code.trim()) processSerialInput(code.trim());
            }
          }
        }
      } catch (error) {
        console.error('Serial read error:', error);
      } finally {
        reader.releaseLock();
      }
    }
  }

  function processSerialInput(code) {
    const activeElement = document.activeElement;
    const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') && !activeElement.readOnly && !activeElement.disabled;

    if (isInput && activeElement.id !== 'scannerTestInput') {
      // Inject into active field
      const start = activeElement.selectionStart || activeElement.value.length;
      const end = activeElement.selectionEnd || activeElement.value.length;
      activeElement.value = activeElement.value.substring(0, start) + code + activeElement.value.substring(end);
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Use general app logic (add to order, search, etc.)
      handleBarcodeScan(code);
    }
  }

  async function connectBluetoothScanner() {
    if (!("bluetooth" in navigator)) {
      return alert("Web Bluetooth is not supported in your browser.");
    }
    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      if (device.gatt) {
        await device.gatt.connect();
        document.getElementById('scannerConnectionStatus').textContent = `Connected: ${device.name}`;
        document.getElementById('scannerConnectionStatus').style.color = '#28a745';
      }
    } catch (error) {
      console.error('Bluetooth Scanner connection failed:', error);
    }
  }

  // ===== Printer Functions =====

  async function connectUSBPrinter() {
    if (!("usb" in navigator)) {
      return alert(
        "WebUSB API is not supported in your browser. Please use a recent version of Chrome or Edge."
      );
    }

    try {
      const device = await navigator.usb.requestDevice({ filters: [{ classCode: 7 }] }); // 7 is the class code for printers
      await device.open();
      await device.selectConfiguration(1);
      const iface = device.configuration.interfaces.find(i => i.interfaceClass === 7);
      await device.claimInterface(iface.interfaceNumber);

      printerDevice = device;
      printerType = 'USB';
      updatePrinterStatus(true, device.productName);
      alert(`Connected to USB printer: ${device.productName}`);
    } catch (error) {
      console.error('USB connection failed:', error);
      alert('Failed to connect to USB printer. Make sure it is connected and you have granted permission.');
    }
  }

  async function connectBluetoothPrinter() {
    if (!("bluetooth" in navigator)) {
      return alert(
        "Web Bluetooth is not supported in your browser. This feature works best in Chrome on Android, Windows, and macOS. It is NOT supported on iPhone or iPad."
      );
    }

    try {
      // Use acceptAllDevices to allow the user to select from any nearby BLE device.
      // We can still suggest common services to help the browser prioritize.
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb"], // Serial Port Profile
      });

      const server = await device.gatt.connect();
      printerDevice = server;
      printerType = 'BLUETOOTH';
      updatePrinterStatus(true, device.name);
      alert(`Connected to Bluetooth printer: ${device.name}`);
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      alert(
        "Failed to connect. Make sure the printer is on, discoverable (often a blinking blue light), and you grant permission. Note: This feature is not supported on iPhones/iPads."
      );
    }
  }

  function disconnectPrinter() {
    if (printerDevice && printerType === 'BLUETOOTH') {
      printerDevice.disconnect();
    }
    // For WebUSB, closing is more complex and often just releasing the interface is enough.
    // For simplicity, we'll just nullify the device.
    printerDevice = null;
    printerType = null;
    updatePrinterStatus(false);
    alert('Printer disconnected.');
  }

  function updatePrinterStatus(isConnected, deviceName = '') {
    const statusEl = document.getElementById('printerStatus');
    const testBtn = document.getElementById('testPrintBtn');
    const disconnectBtn = document.getElementById('disconnectPrinterBtn');
    const directPrintBtn = document.getElementById('directPrintBtn');
    const headerPrinterIcon = document.getElementById('header-printer-status');

    if (isConnected) {
      statusEl.textContent = `Connected to ${deviceName}`;
      statusEl.style.color = '#28a745';
      testBtn.style.display = 'inline-block';
      disconnectBtn.style.display = 'inline-block';
      headerPrinterIcon.style.display = 'inline-block';
      if (directPrintBtn) directPrintBtn.style.display = 'inline-block';
    } else {
      statusEl.textContent = 'Not Connected';
      statusEl.style.color = 'inherit';
      testBtn.style.display = 'none';
      disconnectBtn.style.display = 'none';
      headerPrinterIcon.style.display = 'none';
      if (directPrintBtn) directPrintBtn.style.display = 'none';
    }
  }

  async function sendDataToPrinter(data) {
    if (!printerDevice) return alert('No printer connected.');

    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data + '\n\n\n'); // Add newlines to feed paper

    try {
      if (printerType === 'USB') {
        const iface = printerDevice.configuration.interfaces.find(i => i.interfaceClass === 7);
        const endpoint = iface.alternate.endpoints.find(e => e.direction === 'out');
        await printerDevice.transferOut(endpoint.endpointNumber, encodedData);

      } else if (printerType === 'BLUETOOTH') {
        // Dynamically find a writable characteristic
        const services = await printerDevice.getPrimaryServices();
        let writableCharacteristic = null;

        for (const service of services) {
          const characteristics = await service.getCharacteristics();
          // Find the first characteristic that is writable
          const found = characteristics.find(
            (c) => c.properties.write || c.properties.writeWithoutResponse
          );
          if (found) {
            writableCharacteristic = found;
            break; // Stop searching once we find one
          }
        }

        if (writableCharacteristic) {
          // Split data into chunks if it's too large for a single write
          const maxChunkSize = writableCharacteristic.service.device.gatt.mtu - 3;
          for (let i = 0; i < encodedData.length; i += maxChunkSize) {
            const chunk = encodedData.subarray(i, i + maxChunkSize);
            await writableCharacteristic.writeValueWithoutResponse(chunk);
          }
        } else {
          throw new Error("No writable characteristic found on the Bluetooth device. This printer may not be compatible.");
        }
      }
    } catch (error) {
      console.error('Failed to print:', error);
      alert('Error sending data to printer. It may have been disconnected or is not compatible. ' + error.message);
      disconnectPrinter();
    }
  }

  function testPrint() {
    const testMessage = 
      '*** Printer Test ***\n' +
      'Connection Successful!\n' +
      `App: ${settings.name || 'Yobill'}\n` +
      `Date: ${new Date().toLocaleString()}\n`;
    sendDataToPrinter(testMessage);
  }

  function directPrint() {
    const receiptContentEl = document.getElementById('receiptContent');
    // Use innerText to get a plain text representation of the receipt
    const plainTextReceipt = receiptContentEl.innerText;
    sendDataToPrinter(plainTextReceipt);
  }

  // ===== Transactions =====
  function renderTransactions() {
    const container = document.getElementById('transactionListContainer');
    const filterDate = document.getElementById('transactionFilterDate').value;
    let filteredTransactions = transactions;
    if (filterDate) {
      filteredTransactions = transactions.filter(t => t.date.startsWith(filterDate));
    }
    // We need the original index to edit/delete, so we map over the original array if not filtering
    const sourceArray = filterDate ? filteredTransactions : transactions;

    const tableRows = sourceArray.map((t, i) => {
      const originalIndex = transactions.indexOf(t);
      const tr = document.createElement('tr');
      const itemsSummary = t.items.map(item => `${item.qty}x ${item.name}`).join(', ');
      tr.innerHTML = `
        <td onclick="previewOrder(transactions[${originalIndex}])" style="cursor: pointer; font-size: 0.8em; white-space: nowrap;">${new Date(t.date).toLocaleString()}</td>
        <td onclick="previewOrder(transactions[${originalIndex}])" style="cursor: pointer; text-align: right; font-size: 0.8em; white-space: nowrap;"><span class="currency-symbol">${settings.currency || '$'}</span>${formatCurrency(t.total)}</td>
        <td style="text-align: right;">
          <button class="icon-btn" title="Re-Open Bill" onclick="reopenTransaction(${originalIndex})"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/></svg></button>
          <button class="icon-btn" title="Download PDF" onclick="downloadBillAsPDF(${originalIndex})"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L6.354 8.146a.5.5 0 1 0-.708.708l2 2z"/></svg></button>
          <button class="icon-btn" title="Delete Bill" onclick="deleteTransaction(${originalIndex})"><svg xmlns="http://www.w.org/2000/svg" width="16" height="16" fill="#dc3545" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg></button>
        </td>
      `;
      return tr;
    });

    const tbody = document.getElementById('transactionHistoryBody');
    tbody.innerHTML = ''; // Clear existing rows
    tableRows.forEach(row => tbody.appendChild(row));
  }
  
  async function downloadBillAsPDF(transactionIndex) {
    const transaction = transactions[transactionIndex];
    const receiptModal = document.getElementById('receiptModal');
    const originalDisplayStyle = receiptModal.style.display;

    // Temporarily make the modal visible but position it off-screen
    // so html2canvas can render it.
    receiptModal.style.position = 'absolute';
    receiptModal.style.left = '-9999px';
    receiptModal.style.display = 'flex';

    // 1. Populate the hidden receipt content with the data from the selected transaction.
    populateReceiptContent(transaction);
    // 2. Call the existing function that handles saving the currently loaded receipt.
    // This reuses the code and ensures identical functionality.
    await downloadCurrentReceiptAsPDF();

    // 3. Restore the modal's original state.
    receiptModal.style.display = originalDisplayStyle;
    receiptModal.style.position = 'fixed';
    receiptModal.style.left = '0';
  }

  /**
   * Populates the content of the receipt modal without displaying it.
   * This is a helper for PDF generation.
   */
  function populateReceiptContent(transaction) {
      const { date, customerName, tableNo, items, total, subtotal, tax } = transaction;
      const transactionId = new Date(date).getTime();
      const currencySymbol = settings.currency || '$';
      
      // Fallback for old transactions that might not have subtotal/tax saved
      const displaySubtotal = subtotal !== undefined ? subtotal : total; // If no tax info, assume total is subtotal
      const displayTax = tax !== undefined ? tax : 0;

      const itemsHtml = items.map(o => `
        <div class="item-row">
          <div class="col-name">${o.name} ${o.notes ? `<br><small style="font-style: italic;">- ${o.notes}</small>` : ''}</div>
          <div class="col-qty">${o.qty}x</div>
          <div class="col-price"><span class="currency-symbol">$</span>${formatCurrency(o.price)}</div>
          <div class="col-total"><span class="currency-symbol">$</span>${formatCurrency(o.qty * o.price)}</div>
        </div>
      `).join('');

      const receiptHtml = `
        <div class="receipt-header">
          <div class="logo">${settings.logo ? `<img src="${settings.logo}" style="width:50px; height:50px; object-fit:contain;">` : '🧾'}</div>
          <h3>${settings.name || 'My Business'}</h3>
          <p>${settings.address || '123 Business Avenue, Suite 100'}</p>
        </div>
        <div class="receipt-details">
          <div><span>Transaction ID:</span> <span>${transactionId}</span></div>
          <div><span>Date:</span> <span>${new Date(date).toLocaleDateString()}</span></div>
          <div><span>Time:</span> <span>${new Date(date).toLocaleTimeString()}</span></div>
          <div><span>Served By:</span> <span>${customerName}</span></div>
          <div><span>Table:</span> <span>${tableNo}</span></div>
        </div>
        <div class="receipt-items">
          <div class="table-header"><div class="col-name">Item</div><div class="col-qty">Qty</div><div class="col-price">Price</div><div class="col-total">Total</div></div>
          ${itemsHtml}
        </div>
        <div class="receipt-summary">
          <div class="summary-line"><span>Subtotal</span> <span><span class="currency-symbol">${currencySymbol}</span>${formatCurrency(displaySubtotal)}</span></div>
          ${displayTax > 0 ? `<div class="summary-line"><span>Tax (${settings.taxRate}%)</span> <span><span class="currency-symbol">${currencySymbol}</span>${formatCurrency(displayTax)}</span></div>` : ''}
          <div class="summary-line total"><span>TOTAL</span> <span><span class="currency-symbol">${currencySymbol}</span>${formatCurrency(total)}</span></div>
        </div>
        <div class="receipt-footer"><p>Thank you for your visit!</p><p class="promo">Get 10% off on your next visit!</p></div>`;
      document.getElementById('receiptContent').innerHTML = receiptHtml;
  }

  function deleteTransaction(index) {
    if (confirm(`Are you sure you want to permanently delete this transaction? This action cannot be undone.`)) {
      transactions.splice(index, 1);
      saveData();
      renderTransactions();
      updateDashboard();
      alert('Transaction deleted.');
    }
  }

  function reopenTransaction(index) {
    const transactionToEdit = transactions[index];
    const tableId = transactionToEdit.tableNo;

    if (activeOrders[tableId] && activeOrders[tableId].items.length > 0) {
      return alert(`Cannot re-open this bill because Table ${tableId} is currently occupied. Please clear the table first.`);
    }

    if (confirm(`This will move the transaction back to an active order on Table ${tableId} and delete the original bill record. Do you want to continue?`)) {
      // Restore the order
      activeOrders[tableId] = { 
        items: transactionToEdit.items, 
        server: transactionToEdit.customerName 
      };

      // Delete the old transaction
      transactions.splice(index, 1);
      saveData();
      updateDashboard();
      alert(`Bill for Table ${tableId} has been re-opened for editing.`);
      // Navigate user to the restored order
      document.getElementById('menuTab').dataset.tableId = tableId;
      showTab('menuTab', document.querySelector('nav button[onclick*="menuTab"]'));
    }
  }

  // ===== Reports =====
  function populateReportFilters() {
    const staffSelect = document.getElementById('reportStaffFilter');
    staffSelect.innerHTML = '<option value="">All Staff</option>';
    staff.forEach(member => {
      staffSelect.innerHTML += `<option value="${member.name}">${member.name}</option>`;
    });
  }

  function renderReport() {
    const reportType = document.getElementById('reportType').value;
    const outputContainer = document.getElementById('reportOutput');
    outputContainer.innerHTML = ''; // Clear previous report

    const reportDate = document.getElementById('reportDate').value;
    const staffFilter = document.getElementById('reportStaffFilter').value;

    let filteredTransactions = transactions.filter(t => {
      if (reportDate) {
        const transactionDateStr = new Date(t.date).toISOString().split('T')[0];
        if (transactionDateStr !== reportDate) return false;
      }
      if (staffFilter && t.customerName !== staffFilter) return false;

      return true;
    });

    if (filteredTransactions.length === 0) {
      outputContainer.innerHTML = '<p style="text-align: center;">No data available for the selected filters.</p>';
      return;
    }

    let reportHtml = '';

    if (reportType === 'salesSummary') {
      const totalRevenue = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
      const totalBills = filteredTransactions.length;
      const paymentMethods = filteredTransactions.reduce((acc, t) => {
        acc[t.paymentMethod] = (acc[t.paymentMethod] || 0) + t.total;
        return acc;
      }, {});

      reportHtml = `<h4>Summary Report</h4>
        <p><strong>Total Revenue:</strong> <span class="currency-symbol">$</span>${formatCurrency(totalRevenue)}</p>
        <p><strong>Total Bills:</strong> ${totalBills}</p>
        <h5>Revenue by Payment Method:</h5>
        <ul>
          ${Object.entries(paymentMethods).map(([method, total]) => `<li>${method}: <span class="currency-symbol">$</span>${formatCurrency(total)}</li>`).join('')}
        </ul>`;

    } else if (reportType === 'itemSales') {
      const itemSales = filteredTransactions.flatMap(t => t.items).reduce((acc, item) => {
        if (!acc[item.name]) acc[item.name] = { qty: 0, total: 0 };
        acc[item.name].qty += item.qty;
        acc[item.name].total += item.qty * item.price;
        return acc;
      }, {});

      const sortedItems = Object.entries(itemSales).sort(([,a],[,b]) => b.qty - a.qty);

      reportHtml = `<h4>Item Report</h4><table><thead><tr><th>Item</th><th style="text-align: right;">Quantity Sold</th><th style="text-align: right;">Total Revenue</th></tr></thead><tbody>
        ${sortedItems.map(([name, data]) => `<tr><td>${name}</td><td style="text-align: right;">${data.qty}</td><td style="text-align: right;"><span class="currency-symbol">$</span>${formatCurrency(data.total)}</td></tr>`).join('')}
      </tbody></table>`;

    } else if (reportType === 'categorySales') {
      const categorySales = filteredTransactions.flatMap(t => t.items).reduce((acc, item) => {
        const dish = menu.find(d => d.name === item.name);
        const category = dish ? dish.category : 'Uncategorized';
        if (!acc[category]) acc[category] = { qty: 0, total: 0 };
        acc[category].qty += item.qty;
        acc[category].total += item.qty * item.price;
        return acc;
      }, {});

      const sortedCategories = Object.entries(categorySales).sort(([,a],[,b]) => b.total - a.total);

      reportHtml = `<h4>Category Report</h4><table><thead><tr><th>Category</th><th style="text-align: right;">Quantity Sold</th><th style="text-align: right;">Total Revenue</th></tr></thead><tbody>
        ${sortedCategories.map(([name, data]) => `<tr><td>${name}</td><td style="text-align: right;">${data.qty}</td><td style="text-align: right;"><span class="currency-symbol">$</span>${formatCurrency(data.total)}</td></tr>`).join('')}
      </tbody></table>`;
    }

    outputContainer.innerHTML = reportHtml;
    updateCurrencyDisplay();
  }

  function downloadReportPDF() {
    if (typeof window.jspdf === 'undefined') {
        alert("PDF generation libraries are not loaded. Please check your internet connection.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const reportOutput = document.getElementById('reportOutput');
    const reportTitle = reportOutput.querySelector('h4');
    const reportTable = reportOutput.querySelector('table');

    if (!reportTitle) {
      return alert("Please generate a report first before downloading.");
    }

    const titleText = reportTitle.innerText;
    const reportDate = document.getElementById('reportDate').value || new Date().toISOString().split('T')[0];
    const filename = `${titleText.replace(/ /g, '_')}_${reportDate}.pdf`;

    doc.text(titleText, 14, 15);

    if (reportTable) {
      doc.autoTable({ html: reportTable, startY: 25 });
    } else {
      // For summary report which has no table
      const summaryText = reportOutput.innerText;
      doc.text(summaryText, 14, 25);
    }

    doc.save(filename);
  }

  // ===== Dashboard =====
  let categoryChartInstance;
  let bestSellingItemsChartInstance;
  let dailySalesChartInstance;

  function updateDashboard() {
    // Filter for sellable dishes (items with a recipe) to ensure dashboard reflects the menu, not raw inventory.
    const sellableDishes = menu.filter(item => item.recipe && item.recipe.length > 0);
    document.getElementById('menuCount').textContent = sellableDishes.length;
    document.getElementById('uniqueCategoriesCount').textContent = new Set(sellableDishes.map(d => d.category).filter(Boolean)).size;
    
    // Calculate total stock value (cost of all raw ingredients)
    const totalStockValue = menu
      .filter(item => item.stock !== undefined) // Filter for items with a stock property (raw ingredients)
      .reduce((sum, item) => sum + (item.stock * (item.costPrice || 0)), 0);

    // Calculate total revenue and total cost of goods sold (COGS) from all transactions
    const totalRevenue = transactions.reduce((sum, t) => sum + t.total, 0);
    const totalCost = transactions.reduce((sum, t) => {
        const transactionCost = t.items.reduce((itemSum, item) => {
            const dish = menu.find(d => d.name === item.name);
            // Use the costPrice stored on the dish, which is calculated from its recipe
            return itemSum + ((dish ? dish.costPrice : 0) * item.qty);
        }, 0);
        return sum + transactionCost;
    }, 0);

    const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    const totalBills = transactions.length;

    document.getElementById('stockValue').textContent = formatCurrency(totalStockValue);
    document.getElementById('profitPercentage').textContent = profitMargin.toFixed(2);
    document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('totalBills').textContent = totalBills;
    
    updateCurrencyDisplay();
    renderDashboardChart();
    renderBestSellingItemsChart();
    renderDailySalesChart();
  }

  function renderBestSellingItemsChart() {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('bestSellingItemsChart').getContext('2d');
    const itemSales = transactions.flatMap(t => t.items).reduce((acc, item) => {
      acc[item.name] = (acc[item.name] || 0) + item.qty;
      return acc;
    }, {});

    const sortedItems = Object.entries(itemSales).sort(([, a], [, b]) => b - a).slice(0, 5);
    const labels = sortedItems.map(([name]) => name);
    const data = sortedItems.map(([, qty]) => qty);

    if (bestSellingItemsChartInstance) {
      bestSellingItemsChartInstance.destroy();
    }

    bestSellingItemsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Top 5 Best-Selling Items',
          data: data,
          backgroundColor: '#3d5a80',
        }]
      },
      options: {
        indexAxis: 'y',
        scales: { x: { beginAtZero: true } },
        plugins: { 
          legend: { display: false },
          title: {
            display: true,
            text: 'Top 5 Best-Selling Items'
          }
        }
      }
    });
  }

  function renderDailySalesChart() {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('dailySalesChart').getContext('2d');
    const salesByDay = transactions.reduce((acc, t) => {
      const date = new Date(t.date).toLocaleDateString();
      acc[date] = (acc[date] || 0) + t.total;
      return acc;
    }, {});

    const labels = Object.keys(salesByDay).reverse();
    const data = Object.values(salesByDay).reverse();

    if (dailySalesChartInstance) {
      dailySalesChartInstance.destroy();
    }

    dailySalesChartInstance = new Chart(ctx, {
      type: 'line',
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: 'Daily Sales', data: data, backgroundColor: '#ff6b35' }]
      },
      options: {
        scales: { y: { beginAtZero: true } },
        plugins: { 
          legend: { display: false },
          title: {
            display: true,
            text: 'Daily Sales'
          }
        }
      }
    });
  }
  function renderDashboardChart() {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('categoryChart').getContext('2d');

    // Only count items that have a category assigned.
    const categoryCounts = menu.filter(dish => dish.category).reduce((acc, dish) => {
      if (dish.category) {
        acc[dish.category] = (acc[dish.category] || 0) + 1;
      }
      return acc;
    }, {});

    const labels = Object.keys(categoryCounts);
    const data = Object.values(categoryCounts);

    if (categoryChartInstance) {
      categoryChartInstance.destroy();
    }

    categoryChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Menu Items by Category',
          data: data,
          backgroundColor: ['#ff6b35', '#f7c59f', '#7dcdb8', '#3d5a80', '#98c1d9'],
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Menu Items by Category'
          }
        }
      }
    });
  }

  // ===== Settings =====
  async function saveSettings() {
    settings.name = document.getElementById('companyName').value;
    settings.address = document.getElementById('companyAddress').value;
    settings.contact = document.getElementById('companyContact').value;
    settings.currency = document.getElementById('currency').value;
    settings.lowStockThreshold = parseInt(document.getElementById('lowStockThreshold').value, 10) || 10;
    settings.defaultMarkup = parseFloat(document.getElementById('defaultMarkup').value) || 200;
    settings.taxRate = parseFloat(document.getElementById('taxRate').value) || 0;

    const logoFile = document.getElementById('companyLogo').files[0];
    if (logoFile) {
      settings.logo = await toBase64(logoFile);
    }

    saveData();
    alert('Settings saved!');
    loadSettings(); // Reload to show preview

    // --- Re-render all relevant sections to reflect currency change ---
    updateDashboard();
    renderTables();
    renderMenu(document.getElementById('menuTab').dataset.tableId);
    renderDishesTable();
    renderInventoryReport();
    renderStockListTable();
  }
