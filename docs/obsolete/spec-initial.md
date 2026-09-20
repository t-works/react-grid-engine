This project is npm library grid engine :
1. It always should fill the container 100% width and height
2. It should consist of draggable containers
3. Each container has a draggable tab.
4. Containers can be groupped.
5. The layout has to be serializable/deserializable from json.
6. The serialized data structure should contain binding for the contained component and configuration of this component in data shape relevant to that particular component.
7. Container should be able to emit events from contained component and receive events from react app that hosts it. IE it should be able to pass component configuration updated in real time, save configuration changes dispatched by the component, emit events to app data store.
8. Each container should have an id.
9. It should be done using react 18.3 and TS, ready for migration to 19 as much as possible
10. It should have as little dependencies as possible.
