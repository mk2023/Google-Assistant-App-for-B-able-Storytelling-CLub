const { conversation } = require('@assistant/conversation');
//const functions = require('firebase-functions');

const app = conversation();

app.handle('popular_books', conv => {
  // Implement your code here
  conv.add("인기 책 리스트");
});

app.handle('rich_response', conv => {
  conv.add('This is a card rich response.');
  conv.add(new Card({
    title: 'Card Title',
    subtitle: 'Card Subtitle',
    text: 'Card Content',
    image: new Image({
      url: 'https://developers.google.com/assistant/assistant_96.png',
      alt: 'Google Assistant logo'
    })
  }));
});

exports.ActionsOnGoogleFulfillment = functions.https.onRequest(app);
