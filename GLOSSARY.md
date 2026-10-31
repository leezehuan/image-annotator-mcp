# Image Annotator

This context describes images that can be passed through the annotation workflow.

## Language

**Conversation attachment**:
An image supplied as part of a conversation rather than as an existing local file.
_Avoid_: Inline image, uploaded file

**Temporary image**:
An image saved from a conversation attachment for use by the image tools, eligible for cleanup after 24 hours.
_Avoid_: Cached image, permanent upload

**Cached image candidate**:
An image stored by Cherry Studio that may match a conversation attachment. Candidates can come from different chats and need to be matched before selection.
_Avoid_: Current attachment, latest attachment
