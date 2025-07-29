#!/bin/bash
sleep 20 &
pid=$!
echo $pid
wait $pid
