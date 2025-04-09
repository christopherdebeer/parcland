function buildContextMenu(el, controller) {
    if (!el) return;
    controller.contextMenu.innerHTML = "";

    // Type switches
    const typesContainer = document.createElement('div');
    typesContainer.classList.add('btn-container');
    controller.contextMenu.appendChild(typesContainer);

    const types = [
        { type: 'img', icon: 'fa-solid fa-image' },
        { type: 'text', icon: 'fa-solid fa-font' },
        { type: 'html', icon: 'fa-solid fa-code' },
        { type: 'markdown', icon: 'fa-brands fa-markdown' },
        { type: 'canvas-container', icon: 'fa-regular fa-object-group' }
    ];
    types.forEach(t => {
        const btn = document.createElement("button");
        btn.innerHTML = `<i class="${t.icon}"></i>`;
        btn.title = `Type: ${t.type}`;
        if (el.type === t.type) btn.classList.add('selected');
        controller.clickCapture(btn, () => {
            el.type = t.type;
            controller.updateElementNode(controller.elementNodesMap[el.id], el, (el.id === controller.selectedElementId));
            controller.saveCanvas();
        });
        typesContainer.appendChild(btn);
    });

    // Blend mode
    const blendSelect = document.createElement('select');
    controller.contextMenu.appendChild(blendSelect);
    const blends = [
        'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
        'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'
    ];
    blends.forEach(bm => {
        const option = document.createElement('option');
        option.value = bm;
        option.textContent = bm;
        blendSelect.appendChild(option);
    });
    blendSelect.value = el.blendMode || 'normal';
    blendSelect.onchange = (ev) => {
        el.blendMode = ev.target.value;
        controller.updateElementNode(controller.elementNodesMap[el.id], el, (el.id === controller.selectedElementId));
        controller.saveCanvas();
    };

    // Regen button for images (in context menu only)
    if (el.type === "img") {
        const regenBtn = document.createElement("button");
        regenBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> Regen';
        regenBtn.onclick = () => {
            controller.regenerateImage(el);
            controller.hideContextMenu();
        };
        controller.contextMenu.appendChild(regenBtn);
    }

    // Color picker for text/markdown
    if (el.type === 'text' || el.type === 'markdown') {
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = el.color || "#000000";
        colorInput.addEventListener('change', (ev) => {
            el.color = ev.target.value;
            controller.updateElementNode(controller.elementNodesMap[el.id], el, (el.id === controller.selectedElementId));
            controller.saveCanvas();
        });
        controller.contextMenu.appendChild(colorInput);
    }

    // Toggle static
    const staticBtn = document.createElement("button");
    staticBtn.innerHTML = el.static ? "Unset Static" : "Set Static";
    controller.clickCapture(staticBtn, () => {
        let node = controller.elementNodesMap[el.id];
        controller.updateElementNode(node, el, true);
        controller.toggleStatic(el);
        if (el.static) {
            controller.staticContainer.appendChild(node);
        } else {
            controller.container.appendChild(node);
        }
        controller.renderElements();
        controller.saveCanvas();
        controller.hideContextMenu();
    });
    controller.contextMenu.appendChild(staticBtn);

    // Open child canvas if applicable
    if (el.type === 'canvas-container' && el.childCanvasState) {
        const openCanvasBtn = document.createElement("button");
        openCanvasBtn.textContent = "Open Child Canvas";
        controller.clickCapture(openCanvasBtn, () => {
            controller.hideContextMenu();
            const childController = new CanvasController(el.childCanvasState, this);
            controller.detach();
            activeCanvasController = childController;
            window.history.pushState({}, "", "?canvas=" + el.childCanvasState.canvasId);
        });
        controller.contextMenu.appendChild(openCanvasBtn);
    }

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit';
    controller.clickCapture(editBtn, () => {
        controller.openEditModal(el);
        controller.hideContextMenu();
    });
    controller.contextMenu.appendChild(editBtn);

    const editIllineBtn = document.createElement("button");
    editIllineBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit inline';
    controller.clickCapture(editIllineBtn, (ev) => {
        controller.createEditElement(ev, el, "content");
        controller.hideContextMenu();
    });
    controller.contextMenu.appendChild(editIllineBtn);




    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
    controller.clickCapture(deleteBtn, () => {
        controller.canvasState.elements = controller.canvasState.elements.filter(e => e.id !== el.id);
        if (controller.elementNodesMap[el.id]) {
            controller.elementNodesMap[el.id].remove();
            delete controller.elementNodesMap[el.id];
        }
        controller.selectedElementId = null;
        controller.hideContextMenu();
        controller.saveCanvas();
    });
    controller.contextMenu.appendChild(deleteBtn);

    // Duplicate button
    const duplicateBtn = document.createElement("button");
    duplicateBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Duplicate';
    controller.clickCapture(duplicateBtn, () => {
        const newEl = { ...el };
        newEl.id = "el-" + Date.now();
        newEl.x += 20;
        newEl.y += 20;
        controller.canvasState.elements.push(newEl);
        controller.selectElement(newEl.id);
        controller.hideContextMenu();
        controller.renderElements();
        controller.saveCanvas();
    });
    controller.contextMenu.appendChild(duplicateBtn);

    const idEl = document.createElement("span")
    idEl.classList.add("id-label");
    idEl.innerHTML = el.id;
    controller.contextMenu.appendChild(idEl);

}

export { buildContextMenu };