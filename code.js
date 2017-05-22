function ConvertGoogleDocToCleanHtml() {
    var body = DocumentApp.getActiveDocument().getBody();
    var numChildren = body.getNumChildren();
    var output = [];
    var images = [];
    var listCounters = {};

    // Walk through all the child elements of the body.
    for (var i = 0; i < numChildren; i++) {
        var child = body.getChild(i);
        output.push(processItem(child, listCounters, images));
    }

    var html = output.join('\r');

    html = cleanOutput(html);
    
    emailHtml(html, images);
}

function emailHtml(html, images) {
    var attachments = [],
        documentName = DocumentApp.getActiveDocument().getName(),
        name = cleanFilename(documentName) + '.html';

    // image attachments
    for (var j=0; j<images.length; j++) {
        attachments.push( {
            "fileName": images[j].name,
            "mimeType": images[j].type,
            "content": images[j].blob.getBytes()
        });
    }

    // the html document attachment
    attachments.push({
        "fileName": name,
        "mimeType": "text/html",
        "content": html
    });

    // send the email
    MailApp.sendEmail({
        to: Session.getActiveUser().getEmail(),
        subject: name,
        body: 'Your converted, sanitized HTML is attached! :)',
        attachments: attachments
     });
}

/*
 * Cleans up output
 */
function cleanOutput(output) {
    var output = output // first, convert to lowercase

    // encode ampersands
    .replace(/&/g, '&amp;')

    // encode mdashes
    .replace(/—/g, '&mdash;')

    // convert single smart quotes
    .replace(/’/g, '\'')

    // convert double smart quotes
    .replace(/(“|”)/g, '"')

    // convert nbsp to spaces (nbsp should not be used for forcing layout)
    .replace(/&nbsp;/g, ' ')

    // remove empty list items
    .replace(/<li><\/li>/gi, '')

    // remove empty strong tags containing only line breaks/carriage returns
    .replace(/<strong>\s+<\/strong>/gi, '')

    // convert tab character to 4-spaces tabs
    .replace(/\t/gi, '    ')

    ; return output;
}

/*
 * Cleans up filenames
 */
function cleanFilename(name) {
    var fileName = name.toLowerCase() // first, convert to lowercase

    // strip non-alphanumeric characters (except spaces and periods)
    .replace(/[^a-z0-9\s\.\-]/g, '')

    // convert spaces to hyphens
    .replace(/\s/g, '-')
    
    // remove ".doc/.docx" from filenames
    .replace(/\.docx?/g, '')

    ; return fileName;
}

function dumpAttributes(atts) {
    // Log the paragraph attributes.
    for (var att in atts) {
        Logger.log(att + ":" + atts[att]);
    }
}

function processItem(item, listCounters, images) {
    var output = [],
        prefix = '',
        suffix = '';

    if (item.getType() == DocumentApp.ElementType.PARAGRAPH) {
        switch (item.getHeading()) {
                // Add a # for each heading level. No break, so we accumulate the right number.
            case DocumentApp.ParagraphHeading.HEADING6: 
                prefix = "<h6>", suffix = "</h6>"; break;
            case DocumentApp.ParagraphHeading.HEADING5: 
                prefix = "<h5>", suffix = "</h5>"; break;
            case DocumentApp.ParagraphHeading.HEADING4:
                prefix = "<h4>", suffix = "</h4>"; break;
            case DocumentApp.ParagraphHeading.HEADING3:
                prefix = "<h3>", suffix = "</h3>"; break;
            case DocumentApp.ParagraphHeading.HEADING2:
                prefix = "<h2>", suffix = "</h2>"; break;
            case DocumentApp.ParagraphHeading.HEADING1:
                prefix = "<h1>", suffix = "</h1>"; break;
            default: 
                prefix = "<p>", suffix = "</p>";
        }

        if (item.getNumChildren() == 0)
            return "";
    } else if (item.getType() == DocumentApp.ElementType.INLINE_IMAGE) {
        processImage(item, images, output);
    } else if (item.getType()===DocumentApp.ElementType.LIST_ITEM) {
        var listItem = item;
        var gt = listItem.getGlyphType();
        var key = listItem.getListId() + '.' + listItem.getNestingLevel();
        var counter = listCounters[key] || 0;

        // First list item
        if ( counter == 0 ) {
            // Bullet list (<ul>):
            if (gt === DocumentApp.GlyphType.BULLET
                || gt === DocumentApp.GlyphType.HOLLOW_BULLET
                || gt === DocumentApp.GlyphType.SQUARE_BULLET) {
                prefix = '<ul class="list">\n\t<li>', suffix = "</li>";
            } else {
                // Ordered list (<ol>):
                prefix = '<ol class="list">\n\t<li>', suffix = '</li>';
            }
        } else {
            prefix = "\t<li>";
            suffix = "</li>";
        }

        if (item.isAtDocumentEnd() || (item.getNextSibling() && (item.getNextSibling().getType() != DocumentApp.ElementType.LIST_ITEM))) {
            if (gt === DocumentApp.GlyphType.BULLET
                    || gt === DocumentApp.GlyphType.HOLLOW_BULLET
                    || gt === DocumentApp.GlyphType.SQUARE_BULLET) {
                suffix += "\n</ul>";
            } else {
                // Ordered list (<ol>):
                suffix += "\n</ol>";
            }

        }

        counter++;
        listCounters[key] = counter;
    }

    output.push(prefix);

    if (item.getType() == DocumentApp.ElementType.TEXT) {
        processText(item, output);
    } else {
        if (item.getNumChildren) {
            var numChildren = item.getNumChildren();

            // Walk through all the child elements of the doc.
            for (var i = 0; i < numChildren; i++) {
                var child = item.getChild(i);
                output.push(processItem(child, listCounters, images));
            }
        }
    }

    output.push(suffix);
    return output.join('');
}


function processText(item, output) {
    var text = item.getText(),
        indices = item.getTextAttributeIndices();

    if (indices.length <= 1) {
        // Assuming that a whole para fully italic is a quote
        if(item.isBold()) {
            output.push('<strong>' + text + '</strong>');
        } else if(item.isItalic()) {
            output.push('<blockquote>' + text + '</blockquote>');
        } else if (text.trim().indexOf('http://') == 0 || text.trim().indexOf('https://') == 0) {
            output.push('<a href="' + text + '">' + text + '</a>');
        } else {
            output.push(text);
        }
    } else {
        for (var i=0; i < indices.length; i ++) {
            var partAtts = item.getAttributes(indices[i]),
                startPos = indices[i],
                endPos = i+1 < indices.length ? indices[i+1]: text.length,
                partText = text.substring(startPos, endPos);

            Logger.log(partText);

            if (partAtts.ITALIC) {
                output.push('<em>');
            }

            if (partAtts.BOLD) {
                output.push('<strong>');
            }

            if (partAtts.UNDERLINE) {
                output.push('');
            }

            if (partAtts.LINK_URL) {
                output.push('<a href="' + partAtts.LINK_URL + '">');
            }

            // If someone has written [xxx] and made this whole text some special font, like superscript
            // then treat it as a reference and make it superscript.
            // Unfortunately in Google Docs, there's no way to detect superscript
            if (partText.indexOf('[')==0 && partText[partText.length-1] == ']') {
                output.push('<sup>' + partText + '</sup>');
            } else if (partText.trim().indexOf('http://') == 0 || partText.trim().indexOf('https://') == 0) {
                output.push('<a href="' + partText + '">' + partText + '</a>');
            } else {
                output.push(partText);
            }

            if (partAtts.ITALIC) {
                output.push('</em>');
            }

            if (partAtts.BOLD) {
                output.push('</strong>');
            }

            if (partAtts.UNDERLINE) {
                output.push('');
            }

            if (partAtts.LINK_URL) {
                output.push('</a>');
            }
        }
    }
}


function processImage(item, images, output)
{
    images = images || [];

    var blob = item.getBlob(),
        contentType = blob.getContentType(),
        extension = '';

    if (/\/png$/.test(contentType)) {
        extension = ".png";
    } else if (/\/gif$/.test(contentType)) {
        extension = ".gif";
    } else if (/\/jpe?g$/.test(contentType)) {
        extension = ".jpg";
    } else {
        throw "Unsupported image type: "+contentType;
    }

    /*
     * Build the images
     * Use the document name as the image prefix
     */
    var documentName = DocumentApp.getActiveDocument().getName(),
        imagePath = 'https://content.creditloan.com/wp-content/uploads/',
        alt = item.getAltTitle() || '',
        imagePrefix = cleanFilename(alt ? alt : documentName), // use image alt as image prefix if possible
        imageCounter = images.length,
        fileName = imagePrefix + '-' + imageCounter + extension;

    imageCounter++;
    output.push('<img src="' + imagePath + fileName + '" alt="' + alt + '" />');
    images.push( {
        "blob": blob,
        "type": contentType,
        "name": fileName
    });
}
