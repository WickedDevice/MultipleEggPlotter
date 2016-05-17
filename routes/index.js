var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();
var Promise = require("bluebird");
multiparty = require('connect-multiparty');
multipartyMiddleware = multiparty();
var fs = require('fs-extra-promise');
var moment = require('moment');
var csvparse= Promise.promisify(require('csv-parse'));
var csvstringify = Promise.promisify(require('csv-stringify'));

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/upload', multipartyMiddleware, function(req, res, next) {
  // We are able to access req.files.file thanks to
  // the multiparty middleware
  var files = req.files.files;
  var orig_dest = __dirname.replace(/\\/g,"/");
  var dest = orig_dest.split("/").slice(0, -1).join("/") + "/uploads/" + files[0].originalFilename;

  return Promise.try(function() {
    return files;
  }).map(function(file){
    // read the file contents into memory
    return Promise.try(function(){
      return fs.readFileAsync(file.path);
    }).then(function(contents){
      return {
        contents: contents,
        filename: file.name
      };
    });
  }).map(function(obj){
    // parse the file contents as CSV
    var fileContents = obj.contents;
    fileContents = fileContents.toString().replace(/\r?\n/g, "\r\n");

    var obj = { filename: obj.filename };
    return Promise.try(function(){
      return csvparse(fileContents);
    }).then(function(parsedCsv){
      obj.parsedContents = parsedCsv;
      return obj;
    }).catch(function(err){
        console.log(err);
        return null;
    });
  }).filter(function(obj){
      // reject malformed CSV, but move on with the analysis
      return obj != null;
  }).map(function(obj){
    var parsedCsv = obj.parsedContents;
    var filename = obj.filename;

    // determine the first and last date in this file
    var first_date = null;
    var last_date = null;
    var m = null;
    for(var ii = 0; ii < parsedCsv.length; ii++){
        var row = parsedCsv[ii];
        if(row && row.length > 0){

          m = null;
          try{
            m = moment(row[0], "MM/DD/YYYY HH:mm:ss"); // this is the format generated by the download tool
          }
          catch(e){}; //TODO: discouraged but it's going to happen on the header row

          if(m && m.isValid()){
            if(row[0] != m.format("MM/DD/YYYY HH:mm:ss")){
              console.log("inverse failed");
            }
            row[0] = m; // keep it around as a moment
            if(!first_date){
              first_date = m;
            }
            else if(m.isBefore(first_date)){
              first_date = m;
            }

            if(!last_date){
              last_date = m;
            }
            else if(m.isAfter(last_date)){
              last_date = m;
            }
          }
        }
    }
    return {
      rows: parsedCsv,
      first_date: first_date,
      last_date: last_date,
      filename: filename
    };
  }).then(function(analyzedParsedCsvData){
    // what is the first and last date across all files
    var first_date = analyzedParsedCsvData[0].first_date;
    var last_date = analyzedParsedCsvData[0].last_date;
    for(var ii = 0; ii < analyzedParsedCsvData.length; ii++){
      if(analyzedParsedCsvData[ii].first_date.isBefore(first_date)){
        first_date = analyzedParsedCsvData[ii].first_date;
      }

      if(analyzedParsedCsvData[ii].last_date.isAfter(last_date)){
        last_date = analyzedParsedCsvData[ii].last_date;
      }
    }

    console.log(first_date.format() + " -- " + last_date.format());

    // now go through and merge the files  seek out
    var search_indexes = analyzedParsedCsvData.map(function(){ return 1 ; }); // an array of ones
    var merged_data = []; // this will be an array of rows when we're done

    // make a mega-header row, with header rows from the original files prefixed by the original filename
    var mega_header_row = ["timestamp"];
    var dummy_row = {};
    for(var ii = 0; ii < analyzedParsedCsvData.length; ii++){
      if(analyzedParsedCsvData[ii].rows && analyzedParsedCsvData[ii].rows.length > 0) {
        dummy_row[analyzedParsedCsvData[ii].filename] = [];
        for (var jj = 1; jj < analyzedParsedCsvData[ii].rows[0].length; jj++) {
          // we should only generate a header entry for one timestam
          mega_header_row.push(analyzedParsedCsvData[ii].filename + "-" + analyzedParsedCsvData[ii].rows[0][jj]);
          dummy_row[analyzedParsedCsvData[ii].filename].push("---");
        }
      }
    }
    merged_data.push(mega_header_row); // the first row of the first record should be a header row

    var sample_rate = 1;
    var half_sample_rate = sample_rate / 2;

    // iterate over the time span at the sample rate
    var found = false;
    var start = moment();
    console.log("Beginning merge @ " + start.format());
    var num_missing_records = 0;
    var mega_row = [];
    var candidate_rows = {};
    var timestamp_for_row = null;
    while(first_date.isBefore(last_date)){
      var end_of_window = moment(first_date).add(half_sample_rate, "seconds");
      var start_of_window = moment(first_date).subtract(half_sample_rate, "seconds");
      timestamp_for_row = null;

      //if(moment("2016-03-25 15:00:00", "YYYY-MM-DD HH:mm:ss").isBefore(start_of_window)){
      //  console.log("Break!");
      //}

      // for each sample moment, search for a record in each file that
      // is within a half_sample_rate of the current moment of interest
      // advance the pointer in each file until it is beyond the window
      found = false;
      mega_row = [];

      candidate_rows = {};
      for(var ii = 0; ii < analyzedParsedCsvData.length; ii++){
        if(analyzedParsedCsvData[ii] && analyzedParsedCsvData[ii].filename) {
          candidate_rows[analyzedParsedCsvData[ii].filename] = [];
        }
      }

      for(var ii = 0; ii < analyzedParsedCsvData.length; ii++){
        var jj;
        for(jj = search_indexes[ii]; jj < analyzedParsedCsvData[ii].rows.length; jj++){

          var row = analyzedParsedCsvData[ii].rows[jj].slice(0, analyzedParsedCsvData[ii].rows[jj].length);
          var row_timestamp = row[0];

          // stop searching this file if you encounter a time that occurs after the end of the window
          if(row_timestamp.isAfter(end_of_window)){
            break;
          }
          else if(row_timestamp.isBefore(end_of_window) && row_timestamp.isAfter(start_of_window)){
            // we have a winner for this moment, store it and set the flag
            //row[0] = JSON.stringify(search_indexes)
            //  + " using " + ii + " " + analyzedParsedCsvData[ii].filename
            //  + " " + first_date.format("YYYY-MM-DD HH:mm:ss")
            //  + " " + row_timestamp.format("YYYY-MM-DD HH:mm:ss"); // Plot.ly formatted dates
            row[0] = row_timestamp.format("YYYY-MM-DD HH:mm:ss"); // Plot.ly formatted dates
            timestamp_for_row = row[0];
            //merged_data.push(row); // this is a row
            if(analyzedParsedCsvData[ii] && analyzedParsedCsvData[ii].filename) {
              candidate_rows[analyzedParsedCsvData[ii].filename] = candidate_rows[analyzedParsedCsvData[ii].filename].concat(row);
            }
            found = true;
          }
        }

        search_indexes[ii] = jj; // pick up here on the next moment
      }

      if(!found){
        //console.log("No viable records found for " + first_date.format("YYYY-MM-DD HH:mm:ss"));
        num_missing_records++;
      }
      else{
        // create the mega row and push it
        var mega_row = [timestamp_for_row];
        for(var ii = 0; ii < analyzedParsedCsvData.length; ii++){
          if(analyzedParsedCsvData[ii].rows && analyzedParsedCsvData[ii].rows.length > 0) {
            if(candidate_rows[analyzedParsedCsvData[ii].filename] && candidate_rows[analyzedParsedCsvData[ii].filename].length > 0){
              // there's a candidate row, stuff them into the mega row
              var row = candidate_rows[analyzedParsedCsvData[ii].filename];
              mega_row = mega_row.concat(row.slice(1, row.length));
            }
            else{
              // there's no candidate row... file in blanks for this set of headers
              var row = dummy_row[analyzedParsedCsvData[ii].filename];
              mega_row = mega_row.concat(row);
            }
          }
        }
        merged_data.push(mega_row);
      }

      first_date.add(sample_rate, 'seconds');
    }
    console.log("Merge complete @ " + moment().format() + " [" + moment().diff(start, "seconds") + "], merged down to " + merged_data.length + " records, missing records: " + num_missing_records);

    return merged_data;

  }).then(function(merged_data){
    var data = merged_data;
    return Promise.try(function(){
      return csvstringify(data);
    }).then(function(merged_data_as_string){
      return fs.writeFileAsync(dest, merged_data_as_string);
    }).then(function(){
      return data;
    }).catch(function(err){
      console.log(err);
    })
  }).then(function(data){
    console.log("Merged file ready - process complete");
    res.json({
      filename: files[0].originalFilename,
      data: data
    });
  }).catch(function(exception){
    console.log(exception);
  });
});

module.exports = router;

/*
 var src = file.path;
 var dest = __dirname.split("/").slice(0, -1).join("/") + "/uploads/" + file.originalFilename;
 var f = {
 originalFilename: file.originalFilename
 };
 return Promise.try(function(){
 return fs.copyAsync(src, dest);
 }).then(function(){
 return f;
 }).catch(function(){
 console.log("Copy failed");
 });
 */