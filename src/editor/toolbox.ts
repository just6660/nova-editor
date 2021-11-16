import { CodeConstruct, Expression, Modifier, Statement, VariableReferenceExpr } from "../syntax-tree/ast";
import { DataType, InsertionType } from "../syntax-tree/consts";
import { Module } from "../syntax-tree/module";
import { getUserFriendlyType } from "../utilities/util";
import { EditCodeAction } from "./action-filter";
import { Actions } from "./consts";
import { DocumentationBox } from "./doc-box";
import { EventAction, EventStack, EventType } from "./event-stack";
import { Context } from "./focus";

export const EDITOR_DOM_ID = "editor";

export class ToolboxController {
    module: Module;

    constructor(module: Module) {
        this.module = module;
    }

    addTooltips() {
        const toolboxCategories = Actions.instance().toolboxCategories;

        for (const constructGroup of toolboxCategories) {
            for (const item of constructGroup.items) {
                const button = document.getElementById(item.cssId);

                button.addEventListener("mouseover", () => {
                    const tooltipId = `tooltip-${item.cssId}`;

                    if (!document.getElementById(tooltipId)) {
                        const tooltip = this.createTooltip(item);
                        tooltip.id = tooltipId;

                        tooltip.style.left = `${button.getBoundingClientRect().right + 10}px`;
                        tooltip.style.top = `${button.getBoundingClientRect().top}px`;
                        tooltip.style.display = "block";

                        button.addEventListener("mouseleave", () => {
                            setTimeout(() => {
                                if (tooltip && !tooltip.matches(":hover") && !button.matches(":hover")) {
                                    tooltip.remove();
                                }
                            }, 100);
                        });

                        tooltip.addEventListener("mouseleave", () => {
                            if (tooltip && !tooltip.matches(":hover") && !button.matches(":hover")) {
                                tooltip.remove();
                            }
                        });
                    }
                });
            }
        }
    }

    private createTooltip(code: EditCodeAction): HTMLDivElement {
        let codeAction = null;

        for (const x of this.module.actionFilter.getProcessedConstructInsertions()) {
            if (x.cssId == code.cssId) {
                codeAction = x;
                break;
            }
        }

        const returnType = code.getUserFriendlyReturnType();

        const tooltipContainer = document.createElement("div");
        tooltipContainer.classList.add("tooltip-container");
        document.body.appendChild(tooltipContainer);

        const tooltipTop = document.createElement("div");
        tooltipTop.classList.add("tooltip-top");
        tooltipContainer.appendChild(tooltipTop);

        // if (documentation.tooltip) {
        const tooltipHeader = document.createElement("div");
        tooltipHeader.innerHTML = `<h4>${"some sample header"}</h4>`;
        tooltipHeader.classList.add("tooltip-header");
        tooltipTop.appendChild(tooltipHeader);

        const tooltipText = document.createElement("p");
        tooltipText.classList.add("tooltip-text");
        tooltipText.innerText = "some dummy text about this little code construct that is either working or not.";
        tooltipTop.appendChild(tooltipText);
        // }

        if (returnType) {
            const typeText = document.createElement("div");
            typeText.classList.add("return-type-text");
            typeText.innerHTML = `returns <span class="return-type">${returnType}</span>`;

            tooltipTop.appendChild(typeText);
        }

        if (codeAction?.insertionResult?.insertionType === InsertionType.Invalid) {
            const code = codeAction.getCode();
            const errorMessage = document.createElement("div");
            errorMessage.classList.add("error-text");

            if (code instanceof Modifier) {
                errorMessage.innerText = "This can only be inserted after a --- ";
            } else if (code instanceof Expression) {
                errorMessage.innerText = "This can only be inserted inside a hole with a matching type";
            } else if (code instanceof Statement) {
                errorMessage.innerText = "This can only be inserted at the beginning of a line";
            } else {
                errorMessage.innerText = "Whaaat????";
            }

            tooltipTop.appendChild(errorMessage);
        } else if (codeAction?.insertionResult?.insertionType === InsertionType.DraftMode) {
            const warningMessage = document.createElement("div");
            warningMessage.classList.add("warning-text");
            warningMessage.innerText = "should convert type after insertion into the selected hole";

            tooltipTop.appendChild(warningMessage);
        }

        if (code.documentation) {
            const learnButton = document.createElement("div");
            learnButton.classList.add("learn-button");
            learnButton.innerText = "learn more >";
            tooltipHeader.appendChild(learnButton);

            learnButton.onclick = () => {
                const doc = new DocumentationBox(code.documentation, code.documentation);
            };
        }

        return tooltipContainer;
    }

    updateButtonsOnContextChange() {
        this.module.focus.subscribeOnNavChangeCallback(
            ((c: Context) => {
                const inserts = this.module.actionFilter.getProcessedInsertionsList();

                // mark draft mode buttons
                ToolboxController.updateButtonsVisualMode(inserts);
            }).bind(this)
        );
    }

    static updateButtonsVisualMode(insertionRecords: EditCodeAction[]) {
        for (const insertionRecord of insertionRecords) {
            const button = document.getElementById(insertionRecord.cssId) as HTMLButtonElement;

            if (button) {
                if (insertionRecord.insertionResult.insertionType === InsertionType.DraftMode) {
                    addClassToButton(insertionRecord.cssId, Module.draftModeButtonClass);
                    removeClassFromButton(insertionRecord.cssId, Module.disabledButtonClass);
                    button.disabled = false;
                } else if (insertionRecord.insertionResult.insertionType === InsertionType.Valid) {
                    removeClassFromButton(insertionRecord.cssId, Module.draftModeButtonClass);
                    removeClassFromButton(insertionRecord.cssId, Module.disabledButtonClass);
                    button.disabled = false;
                } else {
                    removeClassFromButton(insertionRecord.cssId, Module.draftModeButtonClass);
                    addClassToButton(insertionRecord.cssId, Module.disabledButtonClass);
                    button.disabled = true;
                }
            }
        }
    }

    loadToolboxFromJson() {
        const toolboxDiv = document.getElementById("editor-toolbox");
        const toolboxMenu = document.getElementById("toolbox-menu");
        const staticDummySpace = document.getElementById("static-toolbox-dummy-space");

        const toolboxCategories = Actions.instance().toolboxCategories;

        for (const constructGroup of toolboxCategories) {
            if (constructGroup) {
                let categoryDiv;

                categoryDiv = document.createElement("div");
                categoryDiv.id = constructGroup.id;
                categoryDiv.classList.add("group");

                const p = document.createElement("p");
                p.textContent = constructGroup.displayName;
                categoryDiv.appendChild(p);

                for (const item of constructGroup.items) {
                    const button = ToolboxButton.createToolboxButtonFromJsonObj(item);

                    categoryDiv.appendChild(button.container);
                }

                toolboxDiv.insertBefore(categoryDiv, staticDummySpace);

                const menuButton = document.createElement("div");
                menuButton.classList.add("menu-button");
                menuButton.innerText = constructGroup.displayName;

                menuButton.addEventListener("click", () => {
                    document.getElementById(constructGroup.id).scrollIntoView({ behavior: "smooth" });
                });

                toolboxMenu.appendChild(menuButton);
            }
        }

        staticDummySpace.style.minHeight = `${
            toolboxDiv.clientHeight - toolboxDiv.children[toolboxDiv.children.length - 2].clientHeight - 20
        }px`;
    }
}

export class ToolboxButton {
    container: HTMLDivElement;

    constructor(text: string, domId?: string, code?: CodeConstruct) {
        this.container = document.createElement("div");
        this.container.classList.add("var-button-container");

        const button = document.createElement("div");
        button.classList.add("button");

        if (!(code instanceof Expression) && !(code instanceof Modifier)) {
            button.classList.add("statement-button");
        } else if (code instanceof Modifier) {
            button.classList.add("modifier-button");
        } else if (code instanceof Expression) {
            button.classList.add("expression-button");
        }

        this.container.appendChild(button);

        if (domId) button.id = domId;

        let htmlText = text.replace(/---/g, "<hole1></hole1>");
        htmlText = htmlText.replace(/--/g, "<hole2></hole2>");
        htmlText = htmlText.trim().replace(/ /g, "&nbsp");
        button.innerHTML = htmlText;
    }

    getButtonElement(): Element {
        return this.container.getElementsByClassName("button")[0];
    }

    removeFromDOM() {
        this.container.remove();
    }

    static createToolboxButtonFromJsonObj(action: EditCodeAction) {
        return new ToolboxButton(action.optionName, action.cssId, action.getCode());
    }

    divButtonVisualMode(insertionType: InsertionType) {
        const element = this.getButtonElement();

        if (insertionType === InsertionType.DraftMode) {
            element.classList.add(Module.draftModeButtonClass);
            element.classList.remove(Module.disabledButtonClass);
        } else if (insertionType === InsertionType.Valid) {
            element.classList.remove(Module.draftModeButtonClass);
            element.classList.remove(Module.disabledButtonClass);
        } else {
            element.classList.remove(Module.draftModeButtonClass);
            element.classList.add(Module.disabledButtonClass);
        }
    }
}

export function addVariableReferenceButton(identifier: string, buttonId: string, events: EventStack): HTMLDivElement {
    const container = document.createElement("grid");
    container.classList.add("var-button-container");

    const wrapperDiv = document.createElement("div");
    wrapperDiv.classList.add("hoverable");

    container.appendChild(wrapperDiv);

    const button = document.createElement("div");
    button.classList.add("button");
    button.id = buttonId;

    wrapperDiv.appendChild(button);

    const typeText = document.createElement("div");
    typeText.classList.add("var-type-text");
    container.appendChild(typeText);

    document.getElementById("vars-button-grid").appendChild(container);

    button.textContent = identifier;

    button.addEventListener("click", () => {
        const action = new EventAction(EventType.OnButtonDown, button.id);
        events.stack.push(action);
        events.apply(action);
    });

    return button;
}

export function removeVariableReferenceButton(buttonId: string): void {
    const button = document.getElementById(buttonId);
    const parent = button.parentElement;
    document.getElementById("vars-button-grid").removeChild(parent.parentElement);
}

/**
 * Create the cascaded menu div object and its options along with their action handlers.
 */
function constructCascadedMenuObj(
    validActions: Map<string, EditCodeAction>,
    buttonId: string,
    module: Module,
    identifier: string
): HTMLDivElement {
    const context = module.focus.getContext();
    const menu = document.createElement("div");
    menu.id = `${buttonId}-cascadedMenu`;
    menu.className = "cascadedMenuMainDiv";

    const header = document.createElement("div");
    header.classList.add("cascaded-menu-header");
    header.innerHTML = `<h3>actions with <span class="identifier">${identifier}</span>:</h3>`;
    menu.appendChild(header);

    let id = 0;

    for (const [key, value] of validActions) {
        const menuItem = document.createElement("div");
        menuItem.classList.add("cascadedMenuContent");

        const menuText = document.createElement("span");
        menuText.classList.add("cascadedMenuOptionTooltip");

        const code = value.getCode();
        let returnType = null;

        if (code instanceof Expression && code.returns != DataType.Void) {
            returnType = " : " + getUserFriendlyType(code.returns);
        }

        value.cssId = `cascadedMenu-button-${id}`;
        id++;
        const menuButton = ToolboxButton.createToolboxButtonFromJsonObj(value);

        menuButton.getButtonElement().classList.add("cascadedMenuItem");
        value.performAction.bind(value);

        menuButton.getButtonElement().addEventListener("click", () => {
            value.performAction(module.executer, module.eventRouter, context);

            menu.remove();
        });

        menuButton.divButtonVisualMode(value.insertionResult.insertionType);

        menuItem.appendChild(menuButton.container);
        menuItem.appendChild(menuText);

        menu.appendChild(menuItem);
    }

    return menu;
}

//creates a cascaded menu dom object with the given options and attaches it to button with id = buttonId.
//also updates its position according to the button it is being attached to.
function createAndAttachCascadedMenu(
    buttonId: string,
    validActions: Map<string, EditCodeAction>,
    module: Module,
    identifier: string
) {
    const button = document.getElementById(buttonId);
    if (!document.getElementById(`${buttonId}-cascadedMenu`)) {
        const menuElement = constructCascadedMenuObj(validActions, buttonId, module, identifier);

        if (menuElement.children.length > 0) {
            const content = document.createElement("div");
            content.classList.add("cascadedMenuContent");
            button.parentElement.appendChild(menuElement);

            const domMenuElement = document.getElementById(`${buttonId}-cascadedMenu`);
            const buttonRect = button.getBoundingClientRect();
            const bodyRect = document.body.getBoundingClientRect();

            const leftPos = buttonRect.left - bodyRect.left + buttonRect.width;
            const topPos = buttonRect.top - bodyRect.top + buttonRect.height;

            domMenuElement.style.left = `${leftPos}px`;
            domMenuElement.style.bottom = `${bodyRect.bottom - buttonRect.bottom}px`;
        }
    }
}

// helper for creating options for a variable's cascaded menu
function getVarOptions(identifier: string, buttonId: string, module: Module): Map<string, EditCodeAction> {
    const dataType = module.variableController.getVariableTypeNearLine(
        module.focus.getFocusedStatement().scope ??
            (
                module.focus.getStatementAtLineNumber(module.editor.monaco.getPosition().lineNumber).rootNode as
                    | Statement
                    | Module
            ).scope,
        module.editor.monaco.getPosition().lineNumber,
        identifier,
        false
    );
    const varRef = new VariableReferenceExpr(identifier, dataType, buttonId);
    return module.actionFilter.validateVariableOperations(varRef);
}

export function createCascadedMenuForVarRef(buttonId: string, identifier: string, module: Module) {
    const button = document.getElementById(buttonId);

    button.addEventListener("mouseover", () => {
        //it is important that these options are regenerated on each mouseover
        createAndAttachCascadedMenu(buttonId, getVarOptions(identifier, buttonId, module), module, identifier);
    });

    button.addEventListener("mouseleave", () => {
        const element = document.getElementById(`${buttonId}-cascadedMenu`);

        if (element && !element.matches(":hover") && !button.matches(":hover")) {
            element.remove();
        }
    });
}

window.onresize = () => {
    const staticDummySpace = document.getElementById("static-toolbox-dummy-space");

    staticDummySpace.style.minHeight = `${
        staticDummySpace.parentElement.clientHeight -
        staticDummySpace.parentElement.children[staticDummySpace.parentElement.children.length - 2].clientHeight -
        20
    }px`;
};

function removeClassFromButton(buttonId: string, className: string) {
    const button = document.getElementById(buttonId);

    if (button) {
        button.classList.remove(className);
    }
}

function addClassToButton(buttonId: string, className: string) {
    const button = document.getElementById(buttonId);

    if (button) {
        button.classList.add(className);
    }
}
