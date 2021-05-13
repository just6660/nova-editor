import * as monaco from 'monaco-editor';
import Editor from '../editor/editor';

//TODO: Might want to change this to be constructor parameters so that boxes of various sizes can be created anywhere
//TODO: Most likely will have to size based on text size inside. Not all messages will be the same length.
const hoverNotificationDefaultWidth = 200;
const hoverNotificationDefaultHeight = 75;
const hoverNotificationMaxHeight = 25;
const notificationParentElement = ".lines-content.monaco-editor-background";

//funcs that all classes should have access to, maybe move within some common parent later
const getDimensionsFromStyle = (styleString: string) => {
    const trimmedStyle = styleString.replace(/\s/g, "");

    const widthMatch = trimmedStyle.match(/width:-?\d+\.?\d+[^%]/);
    const heightMatch = trimmedStyle.match(/height:-?\d+\.?\d+[^%]/);
    const leftMatch = trimmedStyle.match(/left:-?\d+\.?\d+[^%]/);
    const topMatch = trimmedStyle.match(/top:-?\d+\.?\d+[^%]/);

    return {width: (widthMatch ? parseFloat(widthMatch[0].split(":")[1]) : 0),
            height: (heightMatch ? parseFloat(heightMatch[0].split(":")[1]) : 0),
            left: (leftMatch ? parseFloat(leftMatch[0].split(":")[1]) : 0),
            top: (topMatch ? parseFloat(topMatch[0].split(":")[1]) : 0)
    };
}



//TODO: Add documentation for everything in here

/**
 * 
 */
interface NotificationBox{
    notificationBox: HTMLDivElement;

    addNotificationBox();
    setNotificationBoxBounds();
    setNotificationBehaviour();
    moveWithinEditor();
}

/**
 * 
 */
export abstract class Notification{
    messageText: string;
    editor: Editor;
    selection: monaco.Selection;
    index: number;
    parentElement: HTMLDivElement;
    notificationTextDiv: HTMLDivElement;
    domId: string;
    notificationDomIdPrefix: string;

    static currDomId: number = 0;

    constructor(editor: Editor, selection: monaco.Selection, index: number = -1){
        this.selection = selection;
        this.editor = editor;
        this.index = index;

        this.parentElement = document.createElement("div");
    }

    addHighlight(styleClass: string){
        this.parentElement.classList.add(styleClass);
        this.setHighlightBounds();
    }

    setHighlightBounds(){
        const transform = this.editor.computeBoundingBox(this.selection);

        this.parentElement.style.top = `${transform.y + 5}px`;
        this.parentElement.style.left = `${transform.x - 0}px`;

        this.parentElement.style.width = `${transform.width + 0 * 2}px`;
        this.parentElement.style.height = `${transform.height - 5 * 2}px`;
    }

    removeNotificationFromDOM(){
        const parent = document.querySelector(notificationParentElement);
        parent.removeChild(document.getElementById(this.domId));
    }

    setDomId(){
        Notification.currDomId++;

        this.domId = `${this.notificationDomIdPrefix}-${Notification.currDomId}`;
        this.parentElement.setAttribute("id", this.domId)
    }
}

/**
 * Notification that allows user to hover over a selection to see more information.
 */
export class HoverNotification extends Notification implements NotificationBox{
    static notificationFadeDelay = 500; //ms

    notificationBox = null;
    showNotificationBox  = false;

    constructor(editor: Editor, selection: monaco.Selection, index: number = -1, msg: string = ""){
        super(editor, selection, index);

        this.messageText = msg;

        this.notificationDomIdPrefix = "hoverNotification";
        this.addHighlight("hoverNotificationHighlight");
        this.setDomId();

        this.addNotificationBox(); //hover box

        document.querySelector(notificationParentElement).appendChild(this.parentElement);

        this.moveWithinEditor(); //needs to run after the notif element is added to the DOM. Otherwise cannot get offset dimensions when necessary.
    }

    addText(){
        this.notificationTextDiv = document.createElement("div");
        this.notificationTextDiv.appendChild(document.createTextNode(this.messageText));//better to use this for now. Once we have a text "beautifier" we can use innerHTML instead. 
        this.notificationBox.appendChild(this.notificationTextDiv);
    }

    addNotificationBox(){
        this.notificationBox = document.createElement("div");
        this.notificationBox.classList.add("hoverNotificationHover");
        this.notificationBox.style.visibility = "hidden";

        this.setNotificationBehaviour();
        this.addText();
        this.setNotificationBoxBounds();

        this.parentElement.appendChild(this.notificationBox);
    }

    setNotificationBoxBounds(){
        const editorDims = {width: (document.getElementById("editor").getElementsByClassName("monaco-scrollable-element editor-scrollable vs")[0] as HTMLElement).offsetWidth,
                            height: (document.getElementById("editor").getElementsByClassName("monaco-scrollable-element editor-scrollable vs")[0] as HTMLElement).offsetHeight
                           }

        this.notificationBox.style.width = `${0.5 * (editorDims.width > 0 ? editorDims.width  : hoverNotificationDefaultWidth)}px`;
        this.notificationBox.style.maxWidth = `${0.5 * (editorDims.width  > 0 ? editorDims.width  : hoverNotificationDefaultWidth)}px`;
        this.notificationBox.style.maxHeight = `${0.2 * (editorDims.height > 0 ? editorDims.height : hoverNotificationDefaultHeight)}px`
    }

    setNotificationBehaviour(){
        this.parentElement.addEventListener("mouseenter", (e) => {
            this.notificationBox.style.visibility = "visible";
        })

        this.notificationBox.addEventListener("mouseenter", (e) => {
            this.showNotificationBox = true;
        })

        this.notificationBox.addEventListener("mouseleave", (e) => {
            this.showNotificationBox = false;
            this.notificationBox.style.visibility = "hidden";
        })

        this.parentElement.addEventListener("mouseleave", (e) => {
            setTimeout(() => {
                if(!this.showNotificationBox){
                    this.notificationBox.style.visibility = "hidden";
                }
            }, HoverNotification.notificationFadeDelay)
        })
    }

    moveWithinEditor(){
        this.notificationBox.style.left = `${(-(this.notificationBox.offsetWidth - this.parentElement.offsetWidth / 2) / 2) + this.parentElement.offsetWidth / 2}px`;
        this.notificationBox.style.top = `${-this.notificationBox.offsetHeight}px`; //TODO: Maybe raise it up by a few pixels, but it being adjacent could help with hovering detection. THis is only for when it is above the code line, when it is below it actually has some space between the line and the box.

        if((this.parentElement.offsetLeft + this.notificationBox.offsetLeft) < 0){
            this.notificationBox.style.left = `${-this.parentElement.offsetLeft}px`;
        }

        if(this.parentElement.offsetTop + this.notificationBox.offsetTop < 0){
            this.notificationBox.style.top = `${this.editor.computeCharHeight()}px`;
        }
    }
}

/**
 * Notification that stays on the screen for a given period of time and then disappears.
 */
export class PopUpNotification extends Notification implements NotificationBox{
    notificationBox = null;

    constructor(editor: Editor, selection: monaco.Selection, index: number = -1){
        super(editor, selection, index);

        this.notificationDomIdPrefix = "popUpNotification";
        this.setDomId();
        this.addHighlight("popUpNotification"); //probably need to remove this call or make it conditional since we are planning on showing both hovers and pop ups for the same warning at the same time

        this.addNotificationBox();

        document.querySelector(notificationParentElement).appendChild(this.parentElement);
    }  

    addNotificationBox(){
        this.notificationBox = document.createElement("div");
        this.notificationBox.classList.add("popUpNotification");

        //this.setNotificationBoxBounds();
        //this.setNotificationBehaviour();
        //this.moveWithinEditor();

        this.parentElement.appendChild(this.notificationBox);
    }

    setNotificationBoxBounds(){
        throw new Error("NOT IMPLEMENTED...")
    }

    setNotificationBehaviour(){
        throw new Error("NOT IMPLEMENTED...")
    }

    moveWithinEditor(){
        throw new Error("NOT IMPLEMENTED...")
    }
}