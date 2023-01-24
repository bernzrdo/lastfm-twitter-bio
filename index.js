const puppeteer = require('puppeteer-core');
const totp = require('totp-generator');
const https = require('https');
const { twitter, lastfm } = require('./env.json');

let page;

function bio(artist, name, nowPlaying){
    return nowPlaying
        ? `Listening to ${name} by ${artist}`
        : '';
}

async function initTwitter(){

    const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser' });

    page = (await browser.pages())[0];
    await page.goto('https://twitter.com/i/flow/login');

    // username
    log('typing username');
    await page.waitForSelector('input[autocomplete="username"]');
    await page.type('input[autocomplete="username"]', twitter.username + '\n');

    // password
    log('typing password');
    await page.waitForSelector('input[type="password"]');
    await page.type('input[type="password"]', twitter.password + '\n');

    if(twitter['2fa']){
        // 2fa
        log('typing 2fa');
        await page.waitForSelector('input[inputmode="numeric"]');
        await page.type('input[inputmode="numeric"]', totp(twitter['2fa']) + '\n');
    }

    // wait
    await page.waitForNavigation();

}

async function updateBio(bio){

    // edit profile
    await page.goto('https://twitter.com/settings/profile');

    // bio
    await page.waitForSelector('[aria-modal="true"] textarea');
    await page.focus('[aria-modal="true"] textarea');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(bio);

    // save
    await page.click('[data-testid="Profile_Save_Button"]');

    // wait
    await page.waitForNavigation();

}

function getRecentTrack(){
    return new Promise(res=>{

        https.get('https://ws.audioscrobbler.com/2.0/'+
            '?method=user.getrecenttracks'+
            '&user='+encodeURIComponent(lastfm.username)+
            '&limit=1'+
            '&api_key='+encodeURIComponent(lastfm.apiKey)+
            '&format=json', req=>{
                let data = '';
                req.on('data', c=>data+=c);
                req.on('end', ()=>{
                    data = JSON.parse(data);
                    let track = data.recenttracks.track[0];
                    res({
                        artist: track.artist['#text'],
                        name: track.name,
                        nowPlaying: track['@attr']?.nowplaying == 'true',
                    })
                });
            }
        );

    });
}

function time(date){
    let h = date.getHours().toString().padStart(2, 0);
    let m = date.getMinutes().toString().padStart(2, 0);
    let s = date.getSeconds().toString().padStart(2, 0);
    return { h, m, s };
}

function log(msg){
    let { h, m, s } = time(new Date());
    console.log(`[${h}:${m}:${s}] ${msg}`);
}

function oneMinute(){
    return new Promise(res=>{
        
        let secs = 60;
        let { h, m, s } = time(new Date());
        process.stdout.write(`[${h}:${m}:${s}] ${secs}s`);

        let interval = setInterval(()=>{
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            let { h, m, s } = time(new Date());
            process.stdout.write(`[${h}:${m}:${s}] ${--secs}s`);
            if(secs === 0){
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                clearInterval(interval);
                res();
            }
        }, 1e3);

    });
}

let lastBio;
async function update(){

    try{

        let { artist, name, nowPlaying } = await getRecentTrack();

        let newBio = bio(artist, name, nowPlaying);

        if(newBio == lastBio) return;
        lastBio = newBio;

        log(`updating bio to "${newBio}"...`);
        await updateBio(newBio);
        log('success!');

    }catch(e){
        log('error: '+e);
    }

}

(async ()=>{

    log('logging in twitter');
    await initTwitter();
    log('logged in!');

    while(true){
        await update();
        await oneMinute();
    }

})();
