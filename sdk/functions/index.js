
const { conversation, Card, Image, Media } = require('@assistant/conversation');
const functions = require('firebase-functions');
const admin = require('firebase-admin');

const app = conversation({
    clientId: '1007604371141-kj2g2qonefs0e34pg1q2938pvd5g0dmn.apps.googleusercontent.com',
  });


admin.initializeApp();
const db = admin.firestore();

//inside firebase theres firestore, authentication, and many other things. admin organizes everything
const auth = admin.auth();

app.handle('linkAccount', async (conv) => {
    const payload = conv.user.params.tokenPayload;
    if (payload) {
    // Get UID for Firebase auth user using the email of the user
      const email = payload.email;
      if (email) {
        try {
          await auth.getUserByEmail(email).then((userRecord)=>{
              //we find the user by looking at the email inputted in the firebase authenticaiton, and if it's there, we put in the userRecrd
              conv.user.params.email = userRecord.email;
            });
        } catch (e) {
          if (e.code !== 'auth/user-not-found') {
            throw e;
          }
          // If the user is not found, create a new Firebase auth user
          // using the email obtained from Google Assistant
          await auth.createUser({email: email}).then((userRecord)=>{
              //the email that we inputted is put in the firebase user and it is put in userRecord. 
              conv.user.params.email = userRecord.email;
          });
        }
      }
    }
  });


app.handle('read_handle', conv=>{
    const email = conv.user.params.email;
    conv.add(email);
})
  
//Getting the url of the book and reading the book
app.handle('get_url', conv => {
    const bookTitle = conv.intent.params.book.resolved; //the book title; the developer gets the book title from the intent, and it goes into the code
    conv.session.params.koreanTitle = conv.intent.params.book.original;
    conv.session.params.bookTitle = bookTitle;
    const book = db.doc('books/' + bookTitle);
    const snapshot = book;
    if (snapshot.empty) {
        conv.session.params.url = "책이 없습니다. 다른 책 이름을 얘기해주세요."
        conv.scene.next.name = "GetURL";
        return;
    }
    return snapshot.get().then(snapshot => {
        let data = snapshot.data();
        conv.session.params.url = data.link; //writing storage
        
        conv.session.params.read = data.read; //gets the read number
    });
})

app.handle('read_url', async conv => {
    const url = conv.session.params.url; //reading the storage 
    const bookTitle = conv.session.params.bookTitle;
    //conv.add("book title is:" + bookTitle);
    const readAmount = conv.session.params.read+1;

    const book = db.doc('books/' + bookTitle);
    const email = conv.user.params.email;
    let documentRef = await db.collection('users').doc(email)
    await documentRef.set({
        'temp': ''
    })
    await documentRef.collection('books').doc(bookTitle).set({ //puts in the email and bookTItle if it doens't exist, other times it just acts as a pointer
        'Date Read': admin.firestore.Timestamp.fromDate(new Date()) ,
        'Finished' : false,
        'BookTitle': conv.session.params.koreanTitle,
        'StoppedTime': ""
    });

    const snapshot = book;
    if (snapshot.empty) {
        conv.session.params.url = "책이 없어요. 책이름을 다시 얘기해주세요";
        conv.scene.next.name = "GetURL";
        return;
    }
    if (url) {
        snapshot.update({read:readAmount});
        conv.add("책 읽기를 시작합니다.");
        conv.add(new Media({
            mediaObjects: [
                {
                    name: bookTitle,
                    url: url,
                }
            ],
            mediaType: 'AUDIO',
            optionalMediaControls: ['PAUSED', 'STOPPED']
        }));
    }
    else {
        conv.add("책이 없습니다. 책 이름을 다시 얘기해주세요");
        conv.scene.next.name = "GetURL";
    }
})

app.handle('continue_read', async(conv)=>{
    const locale = conv.user.locale;
    const email = conv.user.params.email;
    const collections = db.collection('users').doc(email).collection('books').where("Finished", "==", false).orderBy('Date Read', 'desc').limit(5); //one book is selected
    const snapshot = collections; //don't need this
    if(snapshot.empty){
        conv.add("읽다 만 책이 없습니다. 새로운 책을 읽으세요. 처음으로 가겠습니다.");
        conv.scene.next.name = "Initialize";
        return;
    }

    bookTitleArray = [];

    const newSnapshot = await snapshot.get();
    newSnapshot.forEach(doc=>{
        let data = doc.data();
        bookTitleArray.push(data.BookTitle);
    })
    
    
    if(bookTitleArray.length==1){
        if(locale == "ko-KR")
        {
            conv.add("책을 하나만 읽다 마셨네요" + bookTitleArray.toString() + "을 계속 읽고 싶으시다면 책 이름을 말씀해주세요.")
        }
        else{
            conv.add("You are currently reading only one book. Would you like to continue reading " + bookTitleArray.toString())
        }
    }
    else if(bookTitleArray.length>0)
    {
        if(locale == "ko-KR")
        {
            conv.add(bookTitleArray.toString() + "중 하나 골라주세요")
        }
        else{
            conv.add("The available books are " + bookTitleArray.toString() + ". Please choose one.");
        }
    
    }
    else{
        if(locale == "ko-KR")
        {
            conv.add("읽다 만 책이 없습니다. 새로운 책을 읽으세요. 처음으로 가겠습니다.");
            conv.scene.next.name = "Initialize";
        }
        else{
            conv.add("There are no books you are currently reading.");
        }
    }
})

app.handle('continue_read_url', async(conv)=>{
    const bookTitle = conv.intent.params.book.resolved;
    const email = conv.user.params.email;
    const userbook = db.collection('users').doc(email).collection('books').doc(bookTitle) //in collection users, we have to find the stopped time

    if(userbook.empty){
        conv.add("책을 못 찾았습니다. 책 이름을 다시 말해주세요.");
        conv.scene.next.name = "GetURL";
        return;
    }

    const userbookSnapshot = await userbook.get()
    let userbookData = userbookSnapshot.data();
    progressTime = userbookData.StoppedTime

    conv.session.params.bookTitle = bookTitle;

    const book = db.doc('books/'+bookTitle); //in the collection books, we need to find the book URL

    if(book.empty){
        conv.add("책을 못 찾았습니다. 책 이름을 다시 말해주세요.");
        conv.scene.next.name = "GetURL";
        return;
    }

    const bookSnapshot = await book.get()
    //need the await bc itlll take a long time to get the snapshot; snapshot is the doc object itself, can be any other name
    //dont need to change snapshot because it isn't related to the snapshot in the above lines, 'book' goes into the snapshot
    let bookData = bookSnapshot.data();
    //can't use book.data() because the db.doc(___) only returns document reference object, and in this object methods, there's only a .get function; no .data function exists.
    //doing .get() returns a document snapshot object, and the methods in here has a .data method, which retrieves all fields in the document as an object. 
    
    bookUrl = bookData.link;

    //conv.add(bookUrl);

    await db.collection('users').doc(email).collection('books').doc(bookTitle).update({
        'Date Read': admin.firestore.Timestamp.fromDate(new Date())
    });
    
    if (bookUrl) {
        conv.add("책 읽기를 시작합니다.");
        conv.add(new Media({
            mediaObjects: [
                {
                    name: bookTitle,
                    url: bookUrl,
                }
            ],
            mediaType: 'AUDIO',
            optionalMediaControls: ['PAUSED', 'STOPPED'],
            start_offset: progressTime
        }));
    }
    else {
        conv.add("책이 없습니다. 책 이름을 다시 말해주세요.");
        conv.scene.next.name = "GetURL";
    }


})

// Media status
app.handle('media_status', async (conv) => {
    const mediaStatus = conv.intent.params.MEDIA_STATUS.resolved;
    switch (mediaStatus) {
        case 'FINISHED':
            conv.add('책을 다 읽었어요.');
            const email = conv.user.params.email;
             const bookTitle = conv.session.params.bookTitle;

             let documentRef = await db.collection('users').doc(email).collection('books').doc(bookTitle).update({
                'Finished' : true,
                'StoppedTime': ""
            });
            break;
        case 'FAILED':
            conv.add('책 읽기에 실패하셨어요.');
            break;
        case 'PAUSED' || 'STOPPED':
            if (conv.request.context) {
                // Persist the media progress value
                const progress = conv.request.context.media.progress;
                const email = conv.user.params.email;
                const bookTitle = conv.session.params.bookTitle;

                 let documentRef = await db.collection('users').doc(email).collection('books').doc(bookTitle).update({
                    'Finished' : false,
                    'StoppedTime': progress
                });
            }
            // Acknowledge pause/stop
            conv.add(new Media({
                mediaType: 'MEDIA_STATUS_ACK'
            }));
            break;
        default:
            conv.add('책 읽기에 실패하셨어요.');
    }
});

app.handle('read_all', async conv=>{
    const locale = conv.user.locale;
    const collections = db.collection('books');
    const snapshot = collections;
    if (snapshot.empty) {
        conv.session.params.genres = "Error"
        return;
    }

    bookNames = [];
    const bookSnapshot = await snapshot.get();
    bookSnapshot.forEach(doc=>{
        let data = doc.data();
        if(locale=="ko-KR"){
            bookNames.push(data['name-kr']);
        }
        else{
            bookNames.push(data['name-en']);
        }
    });

    if(locale == "ko-KR")
    {
        conv.add(bookNames.toString()+"중 하나 골라주세요")
    }
    else{
        conv.add("The available books are " + bookNames.toString() + ". Please choose one.");
    }

})

//Getting Genres Start
app.handle('get_all_genres', conv => {
    const locale = conv.user.locale;
    const collections = db.collection('books');
    const snapshot = collections;
    genres = [];
    if (snapshot.empty) {
        conv.session.params.genres = "에러가 생겼습니다. 처음으로 돌아가고 싶다고 말씀하세요."
        return;
    }
    return snapshot.get().then(snapshot => {
        snapshot.forEach(doc => {
            let data = doc.data();
            if (locale == "ko-KR") {
                if (doc.data()['genre-kr']) {
                    genres.push(data['genre-kr']);
                }
            }
            else {
                if (doc.data()['genre-en']) {
                    genres.push(data['genre-en']);
                }
            }
        })
        conv.session.params.genre = genres;
    })
})

app.handle('read_genre', conv => {
    const locale = conv.user.locale;
    const genres = conv.session.params.genre;
    uniqueGenres = [...new Set(genres)]
    if(locale == "ko-KR")
    {
        conv.add(uniqueGenres.toString()+"중 하나 골라주세요")
    }
    else{
        conv.add("The available genres are " + uniqueGenres.toString() + ". Please choose one.");
    }
    
})

app.handle('list_genre_books', async conv => {
    const locale  = conv.user.locale;
    const genre = conv.intent.params.genre.resolved;
    //key will always be returned in english, so its genre-en
    //we'll get the books the person has read and put it into array. Then we're going to 
    //excldue all the books in this array, in the next querry that we're going to call. 
    const email = conv.user.params.email;
    const alreadyreadCollection = db.collection('users').doc(email).collection('books').where("Finished", "==", true).orderBy('Date Read'); //one book is selected
    const reReadSnapshot = alreadyreadCollection; //don't need this
    

    reReadBooks = ["NULL"]; //making empty array
    const newSnapshot = await reReadSnapshot.get(); //making the collection object into the snapshot object
    newSnapshot.forEach(doc=>{
        reReadBooks.push(doc.id); //adding to array one by one
    })


    const collections = db.collection('books').where("name-en", "not-in", reReadBooks).where("genre-en", "==", genre);

    const snapshot = collections;
    genreBooks = [];
    if(snapshot.empty){
        conv.session.params.genreBooks = "Error"
        return;
    }
    return snapshot.get().then(snapshot=>{
        snapshot.forEach(doc=>{
            let data = doc.data();
            if (locale == "ko-KR") {
                if (doc.data()['name-kr']) {
                    genreBooks.push(data['name-kr']);
                }
            }
            else {
                if (doc.data()['name-en']) {
                    genreBooks.push(data['name-en']);
                }
            }
        })
        conv.session.params.genreBooks = genreBooks;
    })
})


app.handle('read_genre_books', conv=>{
    const locale = conv.user.locale;
    const genreBooks = conv.session.params.genreBooks;
    if(locale=="ko-KR"){
        conv.add(genreBooks.toString() + "중 하나 골라주세요.");
    }
    else{
        conv.add("The available books are " + genreBooks.toString() + ". Please choose one");
    }
})

//Getting Genres End

//Getting Newest Uploads Start
app.handle('get_newest_uploads', async conv => {
    const locale = conv.user.locale;
    const email = conv.user.params.email;
    const alreadyreadCollection = db.collection('users').doc(email).collection('books').where("Finished", "==", true).orderBy('Date Read'); //one book is selected
    const reReadSnapshot = alreadyreadCollection; //don't need this

    reReadBooks = ["NULL"]; //making empty array
    const newSnapshot = await reReadSnapshot.get(); //making the collection object into the snapshot object
    newSnapshot.forEach(doc=>{
        reReadBooks.push(doc.id); //adding to array one by one
    })

    const collections = db.collection('books').where("name-en", "not-in", reReadBooks).orderBy("name-en").orderBy('upload_date').limit(5);
    const snapshot = collections;//is an object
    newestUploads = [];
    if (snapshot.empty) {
        conv.session.params.newestUploads = "에러가 생겼습니다. 처음으로 돌아가고 싶다고 말씀하세요."
        return;
    }
    return snapshot.get().then(snapshot => {
        snapshot.forEach(doc => {
            let data = doc.data();
            if (locale == "ko-KR") {
                if (doc.data()['name-kr']) {
                    newestUploads.push(data['name-kr']);
                }
            }
            else {
                if (doc.data()['name-en']) {
                    newestUploads.push(data['name-en']);
                }
            }
        })
        conv.session.params.newestUploads = newestUploads;
    })
})

app.handle('read_newest_uploads', conv=>{
    const locale = conv.user.locale;
    const newestUploads = conv.session.params.newestUploads;
    if(locale=="ko-KR"){
        conv.add(newestUploads.toString() + "중 하나 골라주세요.");
    }
    else{
        conv.add("The available books are " + newestUploads.toString() + ". Please choose one");
    }
})
//Getting Newest Uploads End

//Getting Popular Books Start
app.handle('get_popular_books', async conv => {
    const locale = conv.user.locale;
    const email = conv.user.params.email;
    const alreadyreadCollection = db.collection('users').doc(email).collection('books').where("Finished", "==", true).orderBy('Date Read'); //one book is selected
    const reReadSnapshot = alreadyreadCollection; //don't need this
    

    reReadBooks = ["NULL"]; //making empty array
    const newSnapshot = await reReadSnapshot.get(); //making the collection object into the snapshot object
    newSnapshot.forEach(doc=>{
        reReadBooks.push(doc.id); //adding to array one by one
    })

    const collections = db.collection('books').where("name-en", "not-in", reReadBooks).orderBy("name-en").orderBy('read', 'desc').limit(5);
    const snapshot = collections;//is an object
    popularBooks = [];
    if (snapshot.empty) {
        conv.session.params.popularBooks = "에러가 생겼습니다. 처음으로 돌아가고 싶다고 말씀하세요."
        return;
    }
    return snapshot.get().then(snapshot => {
        snapshot.forEach(doc => {
            let data = doc.data();
            if (locale == "ko-KR") {
                if (doc.data()['name-kr']) {
                    popularBooks.push(data['name-kr']);
                }
            }
            else {
                if (doc.data()['name-en']) {
                    popularBooks.push(data['name-en']);
                }
            }
        })
        conv.session.params.popularBooks = popularBooks;
    })
})

app.handle('read_popular_books', conv=>{
    const locale = conv.user.locale;
    const popularBooks = conv.session.params.popularBooks;
    if(locale=="ko-KR"){
        conv.add(popularBooks.toString()+ "중 하나 골라주세요.");
    }
    else{
        conv.add("The available books are " + popularBooks.toString() + ". Please choose one");
    }
})
//Getting Popular Books End


//Rereading already read books start

app.handle('reread_handle', async conv=>{
    const email = conv.user.params.email;
    const locale = conv.user.locale;
    const collections = db.collection('users').doc(email).collection('books').where("Finished", "==", true).orderBy('Date Read').limit(5); //one book is selected
    const snapshot = collections; //don't need this
    if(snapshot.empty){
        conv.add("읽었던 책이 없습니다. 새로운 책을 읽으세요.");
        return;
    }

    reReadBooks = []; //making empty array
    const newSnapshot = await snapshot.get(); //making the collection object into the snapshot object
    newSnapshot.forEach(doc=>{
        reReadBooks.push(doc.id); //adding to array one by one
    })

    const books = db.collection('books').where('name-en', 'in', reReadBooks);//looks for each doc in books collection and see the name-en of it and sees if its in the reReadBooks Array
    bookNames = [];
    if (books.empty) {
        conv.add('문제가 발생했습니다. 다시 실행하십시오. ');
        return;
    }
    const bookSnapshot = await books.get();
    bookSnapshot.forEach(doc=>{
        let data = doc.data();
        if(locale=="ko-KR"){
            bookNames.push(data['name-kr']);
        }
        else{
            bookNames.push(data['name-en']);
        }
    });

    if(locale=="ko-KR"){
        if(bookNames.length==1)
        {
            conv.add("책을 하나만 끝까지 읽으셨네요. " + bookNames.toString() + " 을 다시 읽고싶으시면 책이름을 말해주세요.")
        }
        else{
            conv.add(bookNames.toString()+ " 중 하나 골라주세요.");
        }
    }
    else{
        if(bookNames.length==1)
        {
            conv.add("You have only read one book. Would you like to read " + bookNames.toString() + " again?")
        }
        else{
            conv.add("The available books are " + bookNames.toString() + ". Please choose one.");
        }
    }


});

app.handle('answer_to_question_one', async(conv)=>{
    const answer = conv.session.params.Answer;
    const email = conv.user.params.email;
    const bookTitle = conv.session.params.bookTitle;
    let documentRef = await db.collection('review').add({
        'dateAdded': admin.firestore.Timestamp.fromDate(new Date()),
        'email':email,
        'bookTitle': bookTitle,
        'q1':answer
    });

    conv.session.params.curReviewId = documentRef.id; //name of document = unique id for each review; sae name of id to use it in the other questions since we have to save it in the same document
    //above line same as conv['session']['params']['curReviewId']
});

app.handle('answer_to_question_two', async(conv)=>{
    const answer = conv.session.params.Answer;
    const reviewId = conv.session.params.curReviewId;
    let documentRef = await db.collection('review').doc(reviewId).set({
        'q2':answer
    }, {merge: true})
});


app.handle('answer_to_question_three', async(conv)=>{
    const answer = conv.session.params.Answer;
    const reviewId = conv.session.params.curReviewId;
    let documentRef = await db.collection('review').doc(reviewId).set({
        'q3':answer
    }, {merge:true})
});


app.handle('answer_to_question_four', async(conv)=>{
    const answer = conv.session.params.Answer;
    const reviewId = conv.session.params.curReviewId;
    let documentRef = await db.collection('review').doc(reviewId).set({
        'q4':answer
    }, {merge:true})

});


app.handle('answer_to_question_five', async(conv)=>{
    const answer = conv.session.params.Answer;
    const reviewId = conv.session.params.curReviewId;
    let documentRef = await db.collection('review').doc(reviewId).set({
        'q5':answer
    }, {merge: true})

});



//Rereading already read books end

exports.ActionsOnGoogleFulfillment = functions.https.onRequest(app);


//reading popular book. newest uploads --> make sure they're unread from before
//for continue read tell other books too
//allow users to go back
//reading popualr books, newest uploads, say next 5
//end

//