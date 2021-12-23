import { CodeConstruct, Expression, Modifier, Statement, VariableReferenceExpr } from "../syntax-tree/ast";
import { DataType, InsertionType, Tooltip } from "../syntax-tree/consts";
import { Module } from "../syntax-tree/module";
import { getUserFriendlyType } from "../utilities/util";
import { LogEvent, Logger, LogType } from "./../logger/analytics";
import { EditCodeAction } from "./action-filter";
import { Actions } from "./consts";
import { EventAction, EventStack, EventType } from "./event-stack";
import { Context } from "./focus";

export const EDITOR_DOM_ID = "editor";

export class ToolboxController {
    static draftModeButtonClass = "button-draft-mode";
    static invalidButtonClass = "button-invalid";
    static validButtonClass = "button-valid";

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
                        const [tooltip, sendUsageFunctions] = this.createTooltip(item);
                        const tooltipStartTime = Date.now();
                        tooltip.id = tooltipId;

                        tooltip.style.left = `${button.getBoundingClientRect().right + 10}px`;
                        tooltip.style.top = `${button.getBoundingClientRect().top}px`;
                        tooltip.style.display = "block";

                        button.addEventListener("click", () => {
                            tooltip.remove();
                        });

                        setTimeout(() => {
                            tooltip.style.opacity = "1";
                        }, 1);

                        const sendDurationLogEvent = () => {
                            Logger.Instance().queueEvent(
                                new LogEvent(LogType.TooltipHoverDuration, {
                                    name: item.cssId,
                                    duration: Date.now() - tooltipStartTime,
                                })
                            );
                        };

                        button.addEventListener("mouseleave", () => {
                            setTimeout(() => {
                                if (tooltip && !tooltip.matches(":hover") && !button.matches(":hover")) {
                                    tooltip.style.opacity = "0";

                                    setTimeout(() => {
                                        sendDurationLogEvent();
                                        sendUsageFunctions.forEach((f) => f());

                                        tooltip.remove();
                                    }, 100);
                                }
                            }, 100);
                        });

                        tooltip.addEventListener("mouseleave", () => {
                            if (tooltip && !tooltip.matches(":hover") && !button.matches(":hover")) {
                                tooltip.style.opacity = "0";

                                setTimeout(() => {
                                    sendDurationLogEvent();
                                    sendUsageFunctions.forEach((f) => f());

                                    tooltip.remove();
                                }, 100);
                            }
                        });
                    }
                });
            }
        }
    }

    private createTooltip(code: EditCodeAction): [HTMLDivElement, Array<() => void>] {
        let codeAction = null;
        const sendUsageFunctions: Array<() => void> = [];

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

        const tooltipHeader = document.createElement("div");
        tooltipHeader.classList.add("tooltip-header");
        const tooltipText = document.createElement("p");
        tooltipText.classList.add("tooltip-text");

        if (code.documentation.tooltip) {
            tooltipHeader.innerHTML = `<h4>${code.documentation.tooltip.title}</h4>`;
            tooltipTop.appendChild(tooltipHeader);

            tooltipText.innerText = code.documentation.tooltip.body;
            tooltipTop.appendChild(tooltipText);
        }

        if (code.documentation.tips) {
            const useCasesContainer = document.createElement("div");
            useCasesContainer.classList.add("use-cases-container");

            for (const tip of code.documentation.tips) {
                if (tip.type == "use-case") {
                    const useCaseComp = new UseCaseSliderComponent(tip, code.cssId);

                    useCasesContainer.appendChild(useCaseComp.element);
                    sendUsageFunctions.push(useCaseComp.sendUsage);
                } else if (tip.type == "quick") {
                    const quickComp = new QuickTipComponent(tip.text);

                    useCasesContainer.appendChild(quickComp.element);
                }
            }

            tooltipContainer.appendChild(useCasesContainer);
        }

        if (returnType) {
            const typeText = document.createElement("div");
            typeText.classList.add("return-type-text");
            typeText.innerHTML = `returns <span class="return-type">${returnType}</span>`;

            tooltipTop.appendChild(typeText);
        }

        if (codeAction?.insertionResult?.insertionType === InsertionType.Invalid) {
            const code = codeAction.getCode() as CodeConstruct;
            const errorMessage = document.createElement("div");
            errorMessage.classList.add("error-text");

            const tooltip = code.getSimpleInvalidTooltip();

            //TODO: #526 this should be changed when that functionality is updated.
            if (tooltip !== "") {
                errorMessage.innerHTML = tooltip;
            } else {
                if (code instanceof Modifier) {
                    errorMessage.innerHTML = "This can only be inserted after a --- ";
                } else if (code instanceof Expression) {
                    errorMessage.innerHTML = "This can only be inserted inside a hole with a matching type";
                } else if (code instanceof Statement) {
                    errorMessage.innerHTML = "This can only be inserted at the beginning of a line";
                }
            }

            tooltipTop.appendChild(errorMessage);
        } else if (codeAction?.insertionResult?.insertionType === InsertionType.DraftMode) {
            const warningMessage = document.createElement("div");
            warningMessage.classList.add("warning-text");
            warningMessage.innerHTML = Tooltip.TypeMismatch;

            tooltipTop.appendChild(warningMessage);
        }

        // if (code.documentation) {
        //     const learnButton = document.createElement("div");
        //     learnButton.classList.add("learn-button");
        //     learnButton.innerText = "learn more >";
        //     tooltipHeader.appendChild(learnButton);

        //     learnButton.onclick = () => {
        //         const doc = new DocumentationBox(code.documentation, code.documentation);
        //     };
        // }

        return [tooltipContainer, sendUsageFunctions];
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
                    removeClassFromButton(insertionRecord.cssId, ToolboxController.invalidButtonClass);
                    removeClassFromButton(insertionRecord.cssId, ToolboxController.validButtonClass);
                    // addClassToButton(insertionRecord.cssId, ToolboxController.draftModeButtonClass);
                    button.disabled = false;
                } else if (insertionRecord.insertionResult.insertionType === InsertionType.Valid) {
                    addClassToButton(insertionRecord.cssId, ToolboxController.validButtonClass);
                    // removeClassFromButton(insertionRecord.cssId, ToolboxController.draftModeButtonClass);
                    removeClassFromButton(insertionRecord.cssId, ToolboxController.invalidButtonClass);
                    button.disabled = false;
                } else {
                    // removeClassFromButton(insertionRecord.cssId, ToolboxController.draftModeButtonClass);
                    removeClassFromButton(insertionRecord.cssId, ToolboxController.validButtonClass);
                    addClassToButton(insertionRecord.cssId, ToolboxController.invalidButtonClass);
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
            // element.classList.add(ToolboxController.draftModeButtonClass);
            element.classList.remove(ToolboxController.invalidButtonClass);
            element.classList.remove(ToolboxController.validButtonClass);
        } else if (insertionType === InsertionType.Valid) {
            // element.classList.remove(ToolboxController.draftModeButtonClass);
            element.classList.remove(ToolboxController.invalidButtonClass);
            element.classList.add(ToolboxController.validButtonClass);
        } else {
            element.classList.remove(ToolboxController.validButtonClass);
            // element.classList.remove(ToolboxController.draftModeButtonClass);
            element.classList.add(ToolboxController.invalidButtonClass);
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

    menu.addEventListener("mouseover", () => {
        setTimeout(() => {
            const element = document.getElementById(`${buttonId}-cascadedMenu`);
            const button = document.getElementById(buttonId);

            if (element && !element.matches(":hover") && !button.matches(":hover")) {
                element.remove();
            }
        }, 100);
    });

    let id = 0;

    for (const [key, value] of validActions) {
        const menuItem = document.createElement("div");
        menuItem.classList.add("cascadedMenuContent");

        const menuText = document.createElement("span");
        menuText.classList.add("cascadedMenuOptionTooltip");

        const code = value.getCode();
        let returnType = null;

        if (code instanceof Expression && code.returns != DataType.Void) {
            returnType = getUserFriendlyType(code.returns);
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

class UseCaseSliderComponent {
    element: HTMLDivElement;
    expanded: boolean;
    sendUsage: () => void;

    constructor(useCase: any, buttonId: string) {
        this.element = this.createUseCaseComponent(
            useCase.path,
            useCase.max,
            useCase.extension,
            useCase.prefix,
            useCase.explanations,
            useCase.title,
            useCase.id,
            buttonId
        );

        this.expanded = false;
    }

    updateExpanded: () => void;

    setExpanded(expanded: boolean) {
        this.expanded = expanded;

        this.updateExpanded();
    }

    createUseCaseComponent(
        path: string,
        max: number,
        extension: string,
        prefix: string,
        explanations: any[],
        title: string,
        id: string,
        buttonId: string
    ): HTMLDivElement {
        const comp = document.createElement("div");
        let useCaseUsed = false;

        const spacingDiv = document.createElement("div");
        spacingDiv.classList.add("spacing");
        comp.appendChild(spacingDiv);

        const useCaseContainer = document.createElement("div");
        useCaseContainer.classList.add("single-use-case-container");
        comp.appendChild(useCaseContainer);

        const useCaseTitleContainer = document.createElement("div");
        useCaseTitleContainer.classList.add("use-case-title");
        useCaseContainer.appendChild(useCaseTitleContainer);

        const useCaseTitle = document.createElement("div");
        useCaseTitle.classList.add("use-case-title-header");
        useCaseTitle.innerText = title;
        useCaseTitleContainer.appendChild(useCaseTitle);

        // const useCaseLearnButton = document.createElement("div");
        // useCaseLearnButton.classList.add("use-case-learn-button");
        // useCaseLearnButton.innerHTML = "learn";
        // useCaseTitleContainer.appendChild(useCaseLearnButton);

        const sliderContainer = document.createElement("div");
        sliderContainer.classList.add("slider-container");
        sliderContainer.style.maxHeight = "0px";
        useCaseContainer.appendChild(sliderContainer);

        const slider = document.createElement("input");
        slider.classList.add("range-slider");
        slider.type = "range";
        slider.min = "1";
        slider.max = max.toString();
        slider.value = "1";

        const labelsContainer = document.createElement("div");
        labelsContainer.classList.add("labels-container");

        const buttonsContainer = document.createElement("div");
        buttonsContainer.classList.add("buttons-container");

        const explanationContainer = document.createElement("div");
        explanationContainer.classList.add("explanation-container");
        explanationContainer.style.opacity = "0.0";

        const updateSlide = () => {
            slideImage.src = slides[parseInt(slider.value) - 1];

            if (explanations) {
                const explanation = explanations.find((exp) => exp.slide == parseInt(slider.value));
                explanationContainer.innerText = explanation ? explanation.text : "-";
                explanationContainer.style.opacity = explanation ? "1.0" : "0.0";
            }

            if (currentSlide.index != parseInt(slider.value) - 1) {
                slideUsage[currentSlide.index].time += Date.now() - currentSlide.startTime;
                slideUsage[currentSlide.index].count++;

                currentSlide.index = parseInt(slider.value) - 1;
                currentSlide.startTime = Date.now();
            }
        };

        const nextBtn = document.createElement("div");
        nextBtn.classList.add("slider-btn");
        nextBtn.innerText = ">";

        nextBtn.addEventListener("click", () => {
            if (slider.value != max.toString()) {
                useCaseUsed = true;

                slider.value = (parseInt(slider.value) + 1).toString();
                updateSlide();
            }
        });

        const prevBtn = document.createElement("div");
        prevBtn.classList.add("slider-btn");
        prevBtn.innerText = "<";
        prevBtn.addEventListener("click", () => {
            if (slider.value != "1") {
                useCaseUsed = true;

                slider.value = (parseInt(slider.value) - 1).toString();
                updateSlide();
            }
        });

        const slides = [];
        const slideUsage = [];

        for (let i = 1; i < max + 1; i++) {
            if (prefix) slides.push(`${path}${prefix}${i}.${extension}`);
            else slides.push(`${path}${i}.${extension}`);

            slideUsage.push({ time: 0, count: 0 });
        }

        let currentSlide = { startTime: Date.now(), index: 0 };

        const slideImage = document.createElement("img");
        sliderContainer.append(slideImage);
        slideImage.classList.add("slider-image");

        slider.oninput = () => {
            useCaseUsed = true;

            updateSlide();
        };

        updateSlide();

        buttonsContainer.appendChild(prevBtn);
        buttonsContainer.append(slider);
        buttonsContainer.appendChild(nextBtn);
        sliderContainer.appendChild(buttonsContainer);

        labelsContainer.appendChild(explanationContainer);
        sliderContainer.appendChild(labelsContainer);

        this.updateExpanded = () => {
            sliderContainer.style.maxHeight = this.expanded ? `${sliderContainer.scrollHeight}px` : "0px";
            useCaseTitleContainer.style.backgroundColor = this.expanded ? "#cfe3eb" : "#fff";

            if (this.expanded) {
                Logger.Instance().queueEvent(
                    new LogEvent(LogType.OpenUseCase, { "use-case": id, "button-id": buttonId })
                );
            }

            if (this.expanded) {
                setTimeout(() => {
                    comp.scrollIntoView({ behavior: "smooth" });
                }, 150);
            }
        };

        useCaseTitleContainer.addEventListener("click", () => {
            this.expanded = !this.expanded;

            this.updateExpanded();
        });

        this.sendUsage = () => {
            if (useCaseUsed) {
                Logger.Instance().queueEvent(
                    new LogEvent(LogType.UseCaseSlideUsage, {
                        "use-case": id,
                        "button-id": buttonId,
                        "slide-usage": slideUsage,
                    })
                );
            }
        };

        return comp;
    }
}

class QuickTipComponent {
    element: HTMLDivElement;

    constructor(text: any) {
        this.element = this.createComponent(text);
    }

    createComponent(text: string): HTMLDivElement {
        const component = document.createElement("div");
        component.classList.add("quick-tip");

        const titleEl = document.createElement("span");
        titleEl.classList.add("quick-tip-title");
        titleEl.innerText = "tip";
        component.appendChild(titleEl);

        const textEl = document.createElement("span");
        textEl.classList.add("quick-tip-text");
        textEl.innerText = text;

        component.appendChild(textEl);

        return component;
    }
}
