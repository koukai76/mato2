import axios from 'axios';
import { parse } from 'node-html-parser';
import moment from 'moment-timezone';
import mysql from 'mysql2';
import cron from 'node-cron';
import express from 'express';
import cors from 'cors';

import * as dotenv from 'dotenv';
dotenv.config();

const GENRE = {
  1: 'news',
  2: 'newsplus',
  3: 'bizplus',
  4: 'mnewsplus',
};

const SQL =
  'INSERT IGNORE INTO matome (`key`, `title`, `date`, `time`, `genre`, `site`, `url`) VALUES ?';

const connection = mysql.createConnection({
  host: process.env.host,
  database: process.env.database,
  user: process.env.user,
  password: process.env.password,
  ssl: {
    rejectUnauthorized: true,
  },
});

const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results, fields) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({ results: results, fields: fields });
    });
  });
};

const kyodemo = async key => {
  const res = await axios({
    method: 'get',
    url: `${process.env.kyo}/${GENRE[key]}/`,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
    },
    timeout: 3000,
    responseType: 'arraybuffer',
  });
  const html = new TextDecoder('shift-jis').decode(res.data);
  const doc = parse(html);
  const target = doc.querySelectorAll('.cltitle');

  let params = [];
  Array.from(target).forEach(m => {
    try {
      const now = moment(new Date());
      now.tz('Asia/Tokyo').format('ha z');

      params.push([
        Number(m.parentNode._attrs.href.split('/')[4]),
        m.textContent
          .replace(m.textContent.split(':')[0], '')
          .replace(':', '')
          .trim(),
        now.format('YYYY-MM-DD'),
        new Date(),
        key,
        2,
        'https://www.kyodemo.net' + m.parentNode._attrs.href,
      ]);
    } catch (error) {}
  });

  await query(SQL, [params]);
};

const ranking = async num => {
  const res = await axios({
    method: 'get',
    url: `${process.env.ranking}?board=${GENRE[num]}`,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
    },
    timeout: 3000,
    responseType: 'arraybuffer',
  });
  const html = new TextDecoder('shift-jis').decode(res.data);
  const doc = parse(html);
  const target = doc.querySelectorAll('.title a');

  const params = [].slice.call(target).map((_, i) => {
    const url = new URL(target[i].getAttribute('href'));
    const params = url.searchParams;
    const thread = params.get('thread');
    const sp = thread.split('/');

    const now = moment(new Date());
    now.tz('Asia/Tokyo').format('ha z');

    return [
      sp[2],
      target[i].textContent,
      now.format('YYYY-MM-DD'),
      new Date(),
      num,
      1,
      'https://' + sp[0] + '/test/read.cgi/' + sp[1] + '/' + sp[2],
    ];
  });

  await query(SQL, [params]);
};

const app = express();
const port = process.env.PORT || 1234;

app.use(cors());
app.use(express.static('public'));

app.get('/get', async (req, res) => {
  res.send({ time: new Date() });
});

app.get('/api/search', async (req, res) => {
  try {
    if (req.header('Authorization') !== 'Bearer abc') {
      throw new Error();
    }

    const genre = req.query.genre;
    const date = req.query.date;

    const ret = await query(
      'select * from matome where date = ? and genre = ?',
      [date, genre]
    );

    res.send({ data: ret.results });
  } catch (error) {
    res.sendStatus(401);
  }
});

app.listen(port, async () => {
  console.log(port);
});

// */10 * * * *
cron.schedule('*/10 * * * *', async () => {
  try {
    const now = new Date();
    const num = (now.getMinutes() - (now.getMinutes() % 10)) / 10;
    if (num === 0 || num === 5) {
      return;
    }

    await kyodemo(num).catch(e => '');
    await ranking(num).catch(e => '');
    console.log(num, 'fin');
  } catch (error) {}
});

(async function () {})();
