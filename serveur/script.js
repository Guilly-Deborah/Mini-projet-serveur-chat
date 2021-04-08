const io = require('socket.io')(3000);
const redis = require ('redis');
var MongoClient = require("mongodb").MongoClient;
//stats
let numUsers = 0;
let idRoom = 2;
let idUser = 1;

let users = [];
/*[{
          "id" : 1
          "username" : "michel",
          "myRooms" : [1, 2, 3, 4]

}]*/
let rooms = [{
    'id':1,
    'name':'test',
    'numUsers':0,
    'users':[]
}];
/*[{
    "id": 1,
    "name": "hello",
   "numUsers": 1,
    "users" : [1, 2, 3, 4],
}]*/
let messages = {'1':[]};
/*{
    "1": [{
         "message" : "hello",
         "user_id" : 1, //if 0 is server send message type
          }]
}*/

const redis = require ('redis');

//Creation of the Redis client
let client=redis.createClient({
    port:3001,
    host: '10.188.1.71'
});
//Initialization of the hash containing the users with a test user
client.hset('users', 'user1', {
    id: 0,
    username: "test"
});

// creation of replicatSet
MongoClient.connect("mongodb://localhost/Tchat?replicaSet=myRepl", function(error , client) {
    if (error) return error;
    myRepl.add("local:3001");
    myRepl.add("local:3002");
    myRepl.addArb("local:3003");
    client.close();
});

io.on('connection', socket => {

    socket.on('add user', username => {
        console.log('connection ' + username);

        socket.user_id = idUser;
        users.push({
            id: idUser,
            username: username,
            myRooms: []
        });
        idUser++;
        numUsers++;

        io.sockets.emit('update users', users);//emit to all people
        socket.emit('update rooms', rooms);//emit only for client
        socket.emit('login', socket.user_id);

        //adding the user to the hash of connected users
        client.hset('users','user'.concat(idUser), {
            id: idUser,
            username: username
        });
        console.log("List of logged in users : ");
        client.hgetall('users');
    });

    socket.on('add room', roomName => {
        let room = {
            id: idRoom,
            name:roomName,
            numUsers: 0,
            users: []
        };

        rooms.push(room);
        io.sockets.emit('update rooms', rooms);//emit to all people

        messages[idRoom] = [];
        idRoom++;

        socket.emit('room created', room);//emit only to client
    });

    socket.on('connect room', room => {
        socket.join(room.id);
        let message = {
            'user_id':0,
            'message': users.find(x => x.id === socket.user_id).username + ' join the room ' + room.name
        };
        socket.broadcast.in(room.id).emit('new message', message);
        messages[room.id].push(message);

        rooms.find(x => x.id === room.id).users.push(socket.user_id);
        rooms.find(x => x.id === room.id).numUsers++;
        io.sockets.emit('update rooms', rooms);//emit to all people

        users.find(x => x.id === socket.user_id).myRooms.push(room.id);
        io.sockets.emit('update users', users);//emit to all people

        socket.emit('go room',
            {
                room,
                messages:messages[room.id]
            });//emit only to client
    });

    socket.on('join room', room => {
        let message = {
            'user_id':0,
            'message': users.find(x => x.id === socket.user_id).username + ' join the room ' + room.name
        };
        socket.broadcast.in(room.id).emit('new message', message);
        messages[room.id].push(message);
        rooms.find(x => x.id === room.id).numUsers++;

        io.sockets.emit('update rooms', rooms);//emit to all people

        socket.emit('go room',
            {
                room,
                messages:messages[room.id]
            });//emit only to client
    });

    socket.on('leave room', room => {
        let message =  {
            'user_id'   :   0,
            'username'  :   'server',
            'message'   :   users.find(x => x.id === socket.user_id).username + ' leave the room ' + room.name
        };
        socket.broadcast.in(room.id).emit('new message', message);
        messages[room.id].push(message);
        rooms.find(x => x.id === room.id).numUsers = (rooms.find(x => x.id === room.id).numUsers === 0) ? 0 : rooms.find(x => x.id === room.id).numUsers - 1;
        io.sockets.emit('update rooms', rooms);//emit to all people
        socket.emit('go leave room');
    });

    socket.on('quit room', room => {
        socket.leave(room.id);
        let message =  {
            'user_id'   :   0,
            'username'  :   'server',
            'message'   :   users.find(x => x.id === socket.user_id).username + ' quit the room ' + room.name
        };
        socket.broadcast.in(room.id).emit('new message', message);

        let myRooms = users.find(x => x.id === socket.user_id).myRooms;
        myRooms = myRooms.filter(item => item !== room.id);
        users.find(x => x.id === socket.user_id).myRooms = myRooms;
        io.sockets.emit('update users', users);//emit to all people

        let idUsers = rooms.find(x => x.id === room.id).users;
        idUsers = idUsers.filter(item => item !== socket.user_id);
        rooms.find(x => x.id === room.id).users = idUsers;
        io.sockets.emit('update rooms', rooms);//emit to all people

        socket.emit('go quit room');
    });

    socket.on('send message', data => {
        let message =  {
            'user_id': socket.user_id,
            'username': users.find(x => x.id === socket.user_id).username,
            'message': data.message
        };
        messages[data.room.id].push(message);
        socket.nsp.to(data.room.id).emit('new message', message);

        //storage of messages in the Message database
        MongoClient.connect("mongodb://localhost/Tchat", function(error , client) {
            if (error) return error;
            console.log("Connecté à la base de données 'Tchat'");
            var db = client.db('Tchat');
            var liste_message = db.collection('messages');
            liste_message.insertOne(message);
            console.log("messages list :")
            liste_message.find();
            client.close();
        });
    });

    socket.on('start typing', roomId => {
        socket.broadcast.to(roomId).emit('new typing', socket.user_id);
    });

    socket.on('stop typing', roomId => {
        socket.broadcast.to(roomId).emit('end typing', socket.user_id);
    });

    socket.on('need update rooms', () => {
        socket.emit('update rooms', rooms);
    });

    socket.on('need update users', () => {
        socket.emit('update users', users);
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', () => {

        //deletion of the user from the hash of connected users
        client.hdel('users','user'.concat(idUser));

        console.log("List of logged in users : ");
        client.hgetall('users');

        console.log('deconnection');
        numUsers--;



    });
});
